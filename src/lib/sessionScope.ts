import type { SupabaseClient } from "@supabase/supabase-js";
export async function closeAppSession(client: Pick<SupabaseClient, "auth">) {
  return client.auth.signOut({ scope: "local" });
}
