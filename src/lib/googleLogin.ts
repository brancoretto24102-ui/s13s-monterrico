import { createClient } from "@supabase/supabase-js";
import { configured, supabase, supabaseUrl, publishableKey } from "./client";
import {
  createOAuthStorage,
  googleEnabled,
  googleOptions,
  OAUTH_FLOW_KEY,
  OAUTH_STORAGE_KEY,
  parseGoogleReturn,
} from "./oauthFlow";

const storage = createOAuthStorage(() => window.sessionStorage);
const oauth = configured
  ? createClient(supabaseUrl!, publishableKey!, {
      auth: {
        flowType: "pkce",
        storageKey: OAUTH_STORAGE_KEY,
        storage,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;
export async function getGoogleAvailability(signal?: AbortSignal) {
  if (!configured) return false;
  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: publishableKey! },
    cache: "no-store",
    signal,
  });
  if (!response.ok)
    throw new Error("No se pudo comprobar la disponibilidad de Google.");
  return googleEnabled(await response.json());
}
export async function startGoogleLogin() {
  if (!oauth || !(await getGoogleAvailability()))
    throw new Error(
      "El ingreso con Google no está disponible en este momento.",
    );
  const request = googleOptions(
    window.location.origin,
    import.meta.env.BASE_URL,
  );
  const { data, error } = await oauth.auth.signInWithOAuth({
    ...request,
    options: { ...request.options, skipBrowserRedirect: true },
  });
  if (error || !data.url || !data.flowId)
    throw new Error(
      "No se pudo iniciar el ingreso con Google. Inténtalo nuevamente.",
    );
  storage.setItem(OAUTH_FLOW_KEY, data.flowId);
  window.location.assign(data.url);
}
let callback: Promise<string | undefined> | undefined;
export function completeGoogleLogin() {
  return (callback ??= finish());
  async function finish() {
    const result = parseGoogleReturn(window.location.href);
    if (!result) return;
    window.history.replaceState(null, "", result.cleanPath);
    const flowId = result.flowId || storage.getItem(OAUTH_FLOW_KEY);
    try {
      if (result.error)
        return result.error === "access_denied"
          ? "El ingreso fue cancelado. Puedes volver a intentarlo."
          : "El enlace de ingreso no pudo completarse. Vuelve a elegir Google o solicita un nuevo enlace de acceso.";
      if (!result.code || !flowId || !oauth || !supabase)
        return "El enlace de Google venció o se abrió en otra pestaña. Inicia el ingreso nuevamente desde esta pestaña.";
      const { data, error } = await oauth.auth.exchangeCodeForSession(
        result.code,
        { flowId },
      );
      if (error || !data.session)
        return "El enlace de Google venció o se abrió en otra pestaña. Inicia el ingreso nuevamente.";
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError)
        return "No se pudo completar la sesión. Vuelve a iniciar el ingreso.";
    } catch {
      return "No se pudo completar el ingreso. Revisa la conexión y vuelve a intentarlo.";
    } finally {
      if (flowId)
        storage.removeItem(`${OAUTH_STORAGE_KEY}-${flowId}-code-verifier`);
      storage.removeItem(`${OAUTH_STORAGE_KEY}-code-verifier`);
      storage.removeItem(OAUTH_FLOW_KEY);
      storage.clearSession();
    }
  }
}
