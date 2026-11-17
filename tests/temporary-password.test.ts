import { describe, expect, it } from "vitest";
import {
  passwordSetup,
  type Setup,
  type SetupRepository,
} from "../supabase/functions/temporary-password/flow";
import {
  secretHash,
  temporarySecret,
} from "../supabase/functions/_shared/temporary-secret";
import { validPassword } from "../src/lib/passwordPolicy";

async function fixture() {
  let now = Date.parse("2026-11-16T12:00:00Z"),
    active = true,
    saveFailure = false,
    saves = 0;
  const secret = temporarySecret();
  let token = await secretHash(secret),
    challenge: string | null = null;
  let row: Setup = {
    token_hash: token,
    user_id: "synthetic",
    generation: "generation-1",
    version: 1,
    state: "pending",
    expires_at: new Date(now + 24 * 60 * 60_000).toISOString(),
    challenge_expires_at: null,
  };
  let savedPassword = "";
  const match = (r: Setup) =>
    r.generation === row.generation && r.version === row.version;
  const repo: SetupRepository = {
    async find(kind, hash) {
      return hash === (kind === "token_hash" ? token : challenge)
        ? { ...row, token_hash: token || null }
        : null;
    },
    async email() {
      return active ? "person@example.invalid" : null;
    },
    async claim(r, hash, expires) {
      if (!match(r)) return false;
      challenge = hash;
      row = {
        ...row,
        state: "claimed",
        challenge_expires_at: expires,
        version: row.version + 1,
      };
      return true;
    },
    async lock(r) {
      if (!match(r) || row.state !== "claimed") return false;
      row = { ...row, state: "applying", version: row.version + 1 };
      return true;
    },
    async save(_, password) {
      if (saveFailure) throw new Error("synthetic Auth failure");
      saves++;
      savedPassword = password;
    },
    async finish(_, success) {
      row = {
        ...row,
        state: success ? "used" : "claimed",
        version: row.version + 1,
      };
      if (success) {
        token = "";
        challenge = null;
      }
    },
  };
  return {
    flow: passwordSetup(repo, () => now),
    secret,
    state: () => row,
    saves: () => saves,
    saved: () => savedPassword,
    expire: (ms: number) => (now += ms),
    inactivate: () => (active = false),
    fail: () => (saveFailure = true),
    rotate: () => {
      row = {
        ...row,
        generation: "generation-2",
        version: row.version + 1,
        state: "pending",
      };
      token = "new-hash";
      challenge = null;
    },
  };
}
const personal = "NuevaClave19@Personal";
describe("Claves temporales con cambio obligatorio", () => {
  it("exige una contraseña personal diferente de la clave temporal", async () => {
    const f = await fixture(),
      r = await f.flow.start("person@example.invalid", f.secret);
    await expect(
      f.flow.complete(r.challenge, f.secret, f.secret),
    ).rejects.toThrow(/diferente/);
    expect(f.saves()).toBe(0);
  });
  it("genera claves aleatorias distintas que cumplen los requisitos actuales", () => {
    const set = new Set(Array.from({ length: 1000 }, () => temporarySecret()));
    expect(set.size).toBe(1000);
    for (const secret of set) {
      expect(secret).toHaveLength(24);
      expect(validPassword(secret)).toBe(true);
    }
  });
  it("solo devuelve un desafío limitado y no una sesión de Auth", async () => {
    const f = await fixture(),
      result = await f.flow.start(" Person@Example.invalid ", f.secret);
    expect(Object.keys(result).sort()).toEqual(["challenge", "expires_at"]);
    expect(result.challenge).toMatch(/^[0-9a-f]{64}$/);
    expect(Date.parse(result.expires_at)).toBe(
      Date.parse("2026-11-16T12:10:00Z"),
    );
    expect(f.saves()).toBe(0);
    expect(f.state().state).toBe("claimed");
  });
  it("rechaza secreto incorrecto, correo distinto, cuenta inactiva y vencimiento", async () => {
    const f = await fixture();
    await expect(
      f.flow.start("person@example.invalid", "A".repeat(24)),
    ).rejects.toThrow(/no es válida/);
    await expect(
      f.flow.start("other@example.invalid", f.secret),
    ).rejects.toThrow(/no es válida/);
    f.inactivate();
    await expect(
      f.flow.start("person@example.invalid", f.secret),
    ).rejects.toThrow(/no es válida/);
    const e = await fixture();
    e.expire(24 * 60 * 60_000);
    await expect(
      e.flow.start("person@example.invalid", e.secret),
    ).rejects.toThrow(/no es válida/);
    expect(f.saves()).toBe(0);
    expect(e.saves()).toBe(0);
  });
  it("exige todos los requisitos y confirmación antes de modificar Auth", async () => {
    const f = await fixture(),
      r = await f.flow.start("person@example.invalid", f.secret);
    await expect(
      f.flow.complete(r.challenge, "1234567890", "1234567890"),
    ).rejects.toThrow(/requisitos/);
    await expect(
      f.flow.complete(r.challenge, personal, personal + "x"),
    ).rejects.toThrow(/no coinciden/);
    expect(f.saves()).toBe(0);
    expect(await f.flow.complete(r.challenge, personal, personal)).toEqual({
      changed: true,
      requires_login: true,
    });
    expect(f.saved()).toBe(personal);
    expect(f.state().state).toBe("used");
    await expect(
      f.flow.complete(r.challenge, personal, personal),
    ).rejects.toThrow(/no es válida/);
    await expect(
      f.flow.start("person@example.invalid", f.secret),
    ).rejects.toThrow(/no es válida/);
    expect(f.saves()).toBe(1);
  });
  it("vence el desafío, lo rota al validar otra vez y revoca la generación anterior", async () => {
    const f = await fixture(),
      first = await f.flow.start("person@example.invalid", f.secret);
    const second = await f.flow.start("person@example.invalid", f.secret);
    await expect(
      f.flow.complete(first.challenge, personal, personal),
    ).rejects.toThrow(/no es válida/);
    f.expire(10 * 60_000);
    await expect(
      f.flow.complete(second.challenge, personal, personal),
    ).rejects.toThrow(/no es válida/);
    const current = await f.flow.start("person@example.invalid", f.secret);
    f.rotate();
    await expect(
      f.flow.complete(current.challenge, personal, personal),
    ).rejects.toThrow(/no es válida/);
    expect(f.saves()).toBe(0);
  });
  it("no actualiza una cuenta que se inactivó después de validar", async () => {
    const f = await fixture(),
      r = await f.flow.start("person@example.invalid", f.secret);
    f.inactivate();
    await expect(
      f.flow.complete(r.challenge, personal, personal),
    ).rejects.toThrow(/no es válida/);
    expect(f.saves()).toBe(0);
  });
  it("dos finalizaciones concurrentes producen un solo cambio", async () => {
    const f = await fixture(),
      r = await f.flow.start("person@example.invalid", f.secret);
    const results = await Promise.allSettled([
      f.flow.complete(r.challenge, personal, personal),
      f.flow.complete(r.challenge, personal, personal),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.saves()).toBe(1);
  });
  it("un rechazo de Auth no anuncia éxito ni consume la clave", async () => {
    const f = await fixture(),
      r = await f.flow.start("person@example.invalid", f.secret);
    f.fail();
    await expect(
      f.flow.complete(r.challenge, personal, personal),
    ).rejects.toThrow(/No se pudo guardar/);
    expect(f.state().state).toBe("claimed");
    expect(f.saves()).toBe(0);
  });
});
