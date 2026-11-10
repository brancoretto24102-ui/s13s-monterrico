import { readFileSync } from "node:fs";
// These settings are intentionally public. Never add server credentials here.
const config = JSON.parse(
  readFileSync(new URL("../config/public.json", import.meta.url), "utf8"),
);
for (const [name, value] of Object.entries({
  VITE_SUPABASE_URL: config.supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: config.supabasePublishableKey,
})) {
  if (typeof value !== "string" || /[\r\n]/.test(value))
    throw Error("Configuración pública inválida.");
  console.log(`${name}=${value}`);
}
