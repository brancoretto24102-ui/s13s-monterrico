const url = process.env.VITE_SUPABASE_URL ?? "",
  key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))
  throw new Error(
    "Falta una URL de proyecto Supabase válida. Se canceló la publicación.",
  );
let anon = false;
try {
  anon =
    JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role ===
    "anon";
} catch {}
if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !anon)
  throw new Error(
    "Se requiere una clave PUBLICABLE o anon, nunca una clave privilegiada. Se canceló la publicación.",
  );
console.log("Configuración pública validada. No se imprimen claves.");
