import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
const blocked = /\.(xlsx?|pdf|csv|zip|sqlite|dump|bak)$/i;
const skip = new Set(["node_modules", ".git", ".pg-test", "test-results"]);
const errors = [];
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === "private")
        errors.push(`Directorio privado dentro del paquete: ${path}`);
      else await scan(path);
      continue;
    }
    if (
      blocked.test(item.name) ||
      (/^\.env(\.|$)/.test(item.name) && item.name !== ".env.example")
    )
      errors.push(`Archivo privado no permitido: ${path}`);
    if ((await stat(path)).size > 5e6)
      errors.push(`Archivo inesperadamente grande: ${path}`);
    if (
      [".ts", ".tsx", ".js", ".mjs", ".json", ".html", ".yml", ".sql"].includes(
        extname(path),
      )
    ) {
      const text = await readFile(path, "utf8");
      if (/sb_secret_[A-Za-z0-9]{15,}/.test(text))
        errors.push(`Posible clave privada: ${path}`);
      for (const token of text.match(
        /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      ) ?? []) {
        try {
          if (
            JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
              .role === "service_role"
          )
            errors.push(`service_role detectado: ${path}`);
        } catch {}
      }
    }
  }
}
await scan(".");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "PASS: paquete sin archivos históricos, PDFs, exportaciones ni claves privadas detectadas. La revisión manual sigue siendo necesaria antes de publicar.",
  );
