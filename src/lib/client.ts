import { createClient } from "@supabase/supabase-js";
import type { Snapshot, Profile } from "./types";
import publicConfiguration from "../../config/public.json";
const url = (import.meta.env.VITE_SUPABASE_URL ||
  publicConfiguration.supabaseUrl) as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  publicConfiguration.supabasePublishableKey) as string | undefined;
export const configured =
  !!url && !!key && !url.includes("YOUR-PROJECT") && !key.includes("REPLACE");
if (
  key &&
  (key.startsWith("sb_secret_") ||
    (key.startsWith("eyJ") && decodeJwtRole(key) === "service_role"))
)
  throw new Error(
    "Configuración rechazada: una clave privada nunca debe estar en el frontend.",
  );
function decodeJwtRole(token: string) {
  try {
    return JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    ).role;
  } catch {
    return null;
  }
}
export const supabase = configured
  ? createClient(url!, key!, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit",
      },
    })
  : null;
export async function rpc<T>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) throw new Error("Falta conectar la base de datos.");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (error.code === "40001")
      throw new Error(
        fn === "manage_conductor"
          ? "Otro administrador actualizó este conductor. Revisa la lista y vuelve a abrir el formulario."
          : "Otro usuario actualizó el registro o la selección. Se actualizarán los datos; revisa el formulario antes de volver a guardar.",
      );
    throw new Error(error.message);
  }
  return data as T;
}
export async function getProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return data;
}
export const loadSnapshot = () => rpc<Snapshot>("get_snapshot");
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadJson(data: unknown, name: string) {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    name,
  );
}
