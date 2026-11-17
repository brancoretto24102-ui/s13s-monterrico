export const OAUTH_STORAGE_KEY = "s13s-monterrico-google";
export const OAUTH_FLOW_KEY = `${OAUTH_STORAGE_KEY}-active-code-verifier`;
export const AUTH_STORAGE_KEY = "s13s-monterrico-auth";
type BackingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Only short-lived PKCE verifiers survive a redirect. Auth sessions stay in memory.
export function createOAuthStorage(
  backing: () => BackingStorage,
  clock = () => Date.now(),
) {
  const memory = new Map<string, string>();
  const verifier = (key: string) =>
    key.startsWith(`${OAUTH_STORAGE_KEY}-`) && key.endsWith("-code-verifier");
  return {
    getItem(key: string) {
      if (!verifier(key)) return memory.get(key) ?? null;
      try {
        const raw = backing().getItem(key);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (
          typeof entry.value !== "string" ||
          !Number.isFinite(entry.until) ||
          entry.until <= clock()
        ) {
          backing().removeItem(key);
          return null;
        }
        return entry.value as string;
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string) {
      if (!verifier(key)) {
        memory.set(key, value);
        return;
      }
      try {
        backing().setItem(
          key,
          JSON.stringify({ value, until: clock() + 10 * 60_000 }),
        );
      } catch {
        throw new Error(
          "Permite el almacenamiento temporal de esta pestaña para continuar con Google.",
        );
      }
    },
    removeItem(key: string) {
      memory.delete(key);
      if (verifier(key))
        try {
          backing().removeItem(key);
        } catch {
          /* No session is persisted. */
        }
    },
    clearSession() {
      memory.clear();
    },
  };
}
export function isPasswordLink(href: string) {
  const url = new URL(href),
    fragment = new URLSearchParams(url.hash.slice(1));
  return (
    !url.searchParams.has("code") &&
    !url.searchParams.has("sb_flow_id") &&
    ["invite", "recovery"].includes(fragment.get("type") ?? "")
  );
}
export function googleOptions(origin: string, base: string) {
  const redirect = new URL(base, origin);
  if (redirect.origin !== new URL(origin).origin)
    throw new Error("Destino de ingreso no válido.");
  redirect.search = "";
  redirect.hash = "";
  return {
    provider: "google" as const,
    options: {
      redirectTo: redirect.href,
      scopes: "openid email profile",
      queryParams: { prompt: "select_account" },
    },
  };
}
export function googleEnabled(settings: unknown) {
  return (
    (settings as { external?: { google?: unknown } })?.external?.google === true
  );
}
export function parseGoogleReturn(href: string) {
  if (isPasswordLink(href)) return null;
  const url = new URL(href),
    params = url.searchParams,
    fragment = new URLSearchParams(url.hash.slice(1));
  if (
    !["code", "error", "error_code", "error_description"].some(
      (key) => params.has(key) || fragment.has(key),
    ) &&
    !fragment.has("access_token") &&
    !fragment.has("refresh_token")
  )
    return null;
  const result = {
    code: params.get("code"),
    flowId: params.get("sb_flow_id"),
    error:
      params.get("error") ||
      params.get("error_code") ||
      fragment.get("error") ||
      fragment.get("error_code") ||
      (fragment.has("access_token") || fragment.has("refresh_token")
        ? "invalid_callback"
        : null),
    cleanPath: "",
  };
  for (const key of [
    "code",
    "sb_flow_id",
    "error",
    "error_code",
    "error_description",
  ])
    params.delete(key);
  result.cleanPath = url.pathname + url.search;
  return result;
}
