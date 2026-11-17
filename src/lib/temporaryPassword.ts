import { supabase } from "./client";
export interface TemporaryCredential {
  email: string;
  temporary_password: string;
  expires_at: string;
}
export async function temporaryPasswordRequest<T>(
  body: Record<string, unknown>,
): Promise<T> {
  if (!supabase) throw new Error("Falta conectar la aplicación.");
  const { data, error } = await supabase.functions.invoke(
    "temporary-password",
    { body },
  );
  if (error || data?.error) {
    let message = data?.error;
    if (
      !message &&
      error &&
      "context" in error &&
      error.context instanceof Response
    ) {
      try {
        message = (await error.context.json()).error;
      } catch {
        /* Usar mensaje general. */
      }
    }
    throw new Error(
      message ||
        "No se pudo validar la clave temporal. Revisa la conexión y vuelve a intentarlo.",
    );
  }
  return data as T;
}
