import { challengeSecret, secretHash } from "../_shared/temporary-secret.ts";
import { validateNewPassword } from "../_shared/password-policy.ts";

export interface Setup {
  token_hash: string | null;
  user_id: string;
  generation: string;
  version: number;
  state: string;
  expires_at: string;
  challenge_expires_at: string | null;
}
export interface SetupRepository {
  find(
    kind: "token_hash" | "challenge_hash",
    hash: string,
  ): Promise<Setup | null>;
  email(userId: string): Promise<string | null>;
  claim(row: Setup, hash: string, expires: string): Promise<boolean>;
  lock(row: Setup): Promise<boolean>;
  save(userId: string, password: string): Promise<void>;
  finish(row: Setup, success: boolean): Promise<void>;
}
const failure = () =>
  new Error(
    "La clave temporal o la sesión de cambio no es válida, venció o ya fue utilizada. Solicita una nueva al administrador.",
  );
export function passwordSetup(repo: SetupRepository, clock = () => Date.now()) {
  function valid(row: Setup | null) {
    return (
      !!row &&
      ["pending", "claimed"].includes(row.state) &&
      Date.parse(row.expires_at) > clock()
    );
  }
  return {
    async start(email: unknown, secret: unknown) {
      if (
        typeof email !== "string" ||
        typeof secret !== "string" ||
        email.length > 254 ||
        secret.length < 16 ||
        secret.length > 128
      )
        throw failure();
      const row = await repo.find("token_hash", await secretHash(secret));
      if (!valid(row)) throw failure();
      const actual = await repo.email(row!.user_id);
      if (!actual || actual.toLowerCase() !== email.trim().toLowerCase())
        throw failure();
      const challenge = challengeSecret();
      const expires = new Date(
        Math.min(clock() + 10 * 60_000, Date.parse(row!.expires_at)),
      ).toISOString();
      if (!(await repo.claim(row!, await secretHash(challenge), expires)))
        throw failure();
      // This is an opaque, limited challenge. No Auth session or application data.
      return { challenge, expires_at: expires };
    },
    async complete(
      challenge: unknown,
      password: unknown,
      confirmation: unknown,
    ) {
      if (typeof challenge !== "string" || !/^[0-9a-f]{64}$/.test(challenge))
        throw failure();
      if (
        typeof password !== "string" ||
        typeof confirmation !== "string" ||
        password.length > 128
      )
        throw new Error(
          "Revisa la contraseña y su confirmación (máximo 128 caracteres).",
        );
      validateNewPassword(password, confirmation);
      const row = await repo.find(
        "challenge_hash",
        await secretHash(challenge),
      );
      if (
        !valid(row) ||
        row!.state !== "claimed" ||
        !row!.challenge_expires_at ||
        Date.parse(row!.challenge_expires_at) <= clock() ||
        !(await repo.email(row!.user_id))
      )
        throw failure();
      if ((await secretHash(password)) === row!.token_hash)
        throw new Error(
          "La contraseña personal debe ser diferente de la clave temporal.",
        );
      if (!(await repo.lock(row!))) throw failure();
      try {
        await repo.save(row!.user_id, password);
      } catch {
        await repo.finish(row!, false);
        throw new Error(
          "No se pudo guardar la contraseña. Revisa los requisitos e inténtalo de nuevo.",
        );
      }
      await repo.finish(row!, true);
      return { changed: true, requires_login: true };
    },
  };
}
