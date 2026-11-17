import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  AUTH_STORAGE_KEY,
  createOAuthStorage,
  googleEnabled,
  googleOptions,
  isPasswordLink,
  OAUTH_FLOW_KEY,
  OAUTH_STORAGE_KEY,
  parseGoogleReturn,
} from "../src/lib/oauthFlow";
import { closeAppSession } from "../src/lib/sessionScope";

function backing() {
  const data = new Map<string, string>();
  return {
    data,
    store: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    },
  };
}
const user = {
  id: "60000000-0000-4000-8000-000000000001",
  email: "synthetic@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "google" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const jwt = (session: string) =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        role: "authenticated",
        session_id: session,
      }),
    ).toString("base64url"),
    Buffer.from("synthetic-signature").toString("base64url"),
  ].join(".");

describe("Google y separación de sesiones", () => {
  it("persiste solo verificadores de S-13 con vencimiento, no sesiones ni claves de S-21", () => {
    const b = backing();
    let now = 1000;
    const storage = createOAuthStorage(
      () => b.store,
      () => now,
    );
    storage.setItem(OAUTH_STORAGE_KEY, "synthetic-session");
    expect(b.data.size).toBe(0);
    storage.setItem(
      `${OAUTH_STORAGE_KEY}-one-code-verifier`,
      "synthetic-verifier",
    );
    storage.setItem(OAUTH_FLOW_KEY, "one");
    b.data.set("s21-monterrico-oauth-other-code-verifier", "other-system");
    const returned = createOAuthStorage(
      () => b.store,
      () => now,
    );
    expect(returned.getItem(OAUTH_STORAGE_KEY)).toBeNull();
    expect(returned.getItem(`${OAUTH_STORAGE_KEY}-one-code-verifier`)).toBe(
      "synthetic-verifier",
    );
    expect(
      returned.getItem("s21-monterrico-oauth-other-code-verifier"),
    ).toBeNull();
    returned.removeItem("s21-monterrico-oauth-other-code-verifier");
    expect(b.data.get("s21-monterrico-oauth-other-code-verifier")).toBe(
      "other-system",
    );
    now += 600000;
    expect(returned.getItem(OAUTH_FLOW_KEY)).toBeNull();
    expect(
      returned.getItem(`${OAUTH_STORAGE_KEY}-one-code-verifier`),
    ).toBeNull();
    expect(b.data.size).toBe(1);
  });
  it("rechaza almacenamiento bloqueado o inválido sin guardar tokens persistentemente", () => {
    const storage = createOAuthStorage(() => {
      throw Error("blocked");
    });
    expect(() => storage.setItem(OAUTH_FLOW_KEY, "flow")).toThrow(
      /almacenamiento/,
    );
    expect(storage.getItem(OAUTH_FLOW_KEY)).toBeNull();
    storage.setItem("session", "memory-only");
    storage.clearSession();
    expect(storage.getItem("session")).toBeNull();
    const b = backing();
    b.data.set(OAUTH_FLOW_KEY, '{"value":"x","until":"invalid"}');
    expect(
      createOAuthStorage(() => b.store).getItem(OAUTH_FLOW_KEY),
    ).toBeNull();
  });
  it("solo pide identidad básica y el regreso exacto a S-13", () => {
    const request = googleOptions("https://example.test", "/s13s-monterrico/");
    expect(request.provider).toBe("google");
    expect(request.options.redirectTo).toBe(
      "https://example.test/s13s-monterrico/",
    );
    expect(request.options.scopes).toBe("openid email profile");
    expect(request.options.queryParams.prompt).toBe("select_account");
    expect(() =>
      googleOptions("https://example.test", "https://other.test/"),
    ).toThrow(/Destino/);
    expect(googleOptions("https://example.test", "/").options.redirectTo).toBe(
      "https://example.test/",
    );
  });
  it("verifica que Google esté habilitado sin inferirlo de valores parecidos", () => {
    expect(googleEnabled({ external: { google: true } })).toBe(true);
    for (const settings of [
      undefined,
      null,
      {},
      { external: { google: "true" } },
      { external: { google: false } },
    ])
      expect(googleEnabled(settings)).toBe(false);
  });
  it("limpia códigos, errores y fragmentos del retorno sin alterar consultas normales", () => {
    const result = parseGoogleReturn(
      "https://example.test/s13s-monterrico/?code=synthetic&sb_flow_id=one&view=reports",
    );
    expect(result).toEqual({
      code: "synthetic",
      flowId: "one",
      error: null,
      cleanPath: "/s13s-monterrico/?view=reports",
    });
    const denied = parseGoogleReturn(
      "https://example.test/s13s-monterrico/?error=access_denied&error_description=private#token",
    );
    expect(denied?.error).toBe("access_denied");
    expect(denied?.cleanPath).toBe("/s13s-monterrico/");
    expect(
      parseGoogleReturn(
        "https://example.test/#access_token=synthetic&refresh_token=synthetic",
      )?.error,
    ).toBe("invalid_callback");
    expect(
      parseGoogleReturn("https://example.test/s13s-monterrico/"),
    ).toBeNull();
  });
  it("conserva las invitaciones y la recuperación por correo; no mezcla retornos", () => {
    for (const kind of ["invite", "recovery"]) {
      const href = `https://example.test/s13s-monterrico/#access_token=synthetic&type=${kind}`;
      expect(isPasswordLink(href)).toBe(true);
      expect(parseGoogleReturn(href)).toBeNull();
    }
    expect(
      isPasswordLink(
        "https://example.test/?code=synthetic#type=recovery&access_token=synthetic",
      ),
    ).toBe(false);
    expect(
      parseGoogleReturn(
        "https://example.test/?code=synthetic#type=recovery&access_token=synthetic",
      )?.error,
    ).toBe("invalid_callback");
  });
  it("el SDK instalado intercambia PKCE con el verificador correcto y deja la sesión en memoria", async () => {
    const b = backing();
    const options = {
      auth: {
        storageKey: OAUTH_STORAGE_KEY,
        storage: createOAuthStorage(() => b.store),
        persistSession: true,
        flowType: "pkce" as const,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    };
    const begin = createClient(
      "https://oauth.example.invalid",
      "synthetic-publishable",
      options,
    );
    const request = googleOptions("https://example.test", "/s13s-monterrico/");
    const started = await begin.auth.signInWithOAuth({
      ...request,
      options: { ...request.options, skipBrowserRedirect: true },
    });
    expect(started.error).toBeNull();
    expect(started.data.flowId).toBeTruthy();
    const authorize = new URL(started.data.url!);
    expect(authorize.searchParams.get("code_challenge_method")).toBe("s256");
    expect(authorize.searchParams.get("code_challenge")).toBeTruthy();
    expect(authorize.searchParams.get("redirect_to")).toBe(
      "https://example.test/s13s-monterrico/",
    );
    let exchanges = 0;
    const returned = createClient(
      "https://oauth.example.invalid",
      "synthetic-publishable",
      {
        ...options,
        auth: { ...options.auth, storage: createOAuthStorage(() => b.store) },
        global: {
          fetch: async (_input, init) => {
            exchanges++;
            const body = JSON.parse(String(init?.body));
            expect(body.auth_code).toBe("synthetic-code");
            expect(body.code_verifier.length).toBeGreaterThan(32);
            return new Response(
              JSON.stringify({
                access_token: jwt("google-session"),
                refresh_token: "synthetic-refresh",
                expires_in: 3600,
                token_type: "bearer",
                user,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          },
        },
      },
    );
    const exchanged = await returned.auth.exchangeCodeForSession(
      "synthetic-code",
      { flowId: started.data.flowId! },
    );
    expect(exchanged.error).toBeNull();
    expect(exchanges).toBe(1);
    expect(b.data.size).toBe(0);
    expect((await returned.auth.getSession()).data.session).toBeTruthy();
    const reload = createClient(
      "https://oauth.example.invalid",
      "synthetic-publishable",
      {
        ...options,
        auth: { ...options.auth, storage: createOAuthStorage(() => b.store) },
      },
    );
    expect((await reload.auth.getSession()).data.session).toBeNull();
  });
  it("cerrar S-13 no revoca la sesión de S-21 para la misma identidad compartida", async () => {
    const one = jwt("s13-session"),
      two = jwt("s21-session"),
      active = new Set([one, two]),
      logoutScopes: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input)),
        token =
          new Headers(init?.headers)
            .get("Authorization")
            ?.replace(/^Bearer /, "") ?? "";
      if (url.pathname.endsWith("/logout")) {
        const scope = url.searchParams.get("scope") ?? "global";
        logoutScopes.push(scope);
        if (scope === "global") active.clear();
        else active.delete(token);
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith("/user"))
        return new Response(
          JSON.stringify(
            active.has(token) ? user : { message: "session expired" },
          ),
          {
            status: active.has(token) ? 200 : 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      throw Error("Unexpected synthetic request");
    };
    const client = (key: string) =>
      createClient(
        "https://sessions.example.invalid",
        "synthetic-publishable",
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: key,
          },
          global: { fetch: fetcher },
        },
      );
    const s13 = client(AUTH_STORAGE_KEY),
      s21 = client("s21-independent-auth");
    expect(
      (
        await s13.auth.setSession({
          access_token: one,
          refresh_token: "synthetic-one",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await s21.auth.setSession({
          access_token: two,
          refresh_token: "synthetic-two",
        })
      ).error,
    ).toBeNull();
    expect((await closeAppSession(s13)).error).toBeNull();
    expect(logoutScopes).toEqual(["local"]);
    expect((await s13.auth.getSession()).data.session).toBeNull();
    expect((await s21.auth.getUser()).data.user?.id).toBe(user.id);
    expect(active.has(two)).toBe(true);
  });
});
