import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { join } from "node:path";

const html = await readFile("dist/index.html", "utf8");
const href = html.match(/<link\s+rel="manifest"\s+href="([^"]+)"/)?.[1];
assert.ok(href, "El HTML compilado debe enlazar el manifiesto.");
const origin = "https://deployment.invalid";
const manifestUrl = new URL(href, origin);
assert.equal(
  manifestUrl.origin,
  origin,
  "El manifiesto debe ser del mismo sitio.",
);
const base = manifestUrl.pathname.replace(/manifest\.webmanifest$/, "");
const manifest = JSON.parse(
  await readFile("dist/manifest.webmanifest", "utf8"),
);
for (const member of ["id", "scope", "start_url"]) {
  assert.equal(
    new URL(manifest[member], manifestUrl).pathname,
    base,
    `${member} debe respetar la ruta de despliegue.`,
  );
}
assert.equal(manifest.display, "standalone");
assert.equal(manifest.prefer_related_applications, false);
for (const size of ["192x192", "512x512"]) {
  assert.ok(
    manifest.icons.some(
      (icon) => icon.sizes === size && icon.purpose === "any",
    ),
  );
}
for (const icon of manifest.icons) {
  const iconUrl = new URL(icon.src, manifestUrl);
  assert.ok(iconUrl.pathname.startsWith(base));
  const png = await readFile(join("dist", icon.src));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
}
assert.ok(html.includes(`href="${base}icons/apple-touch-icon.png"`));
await readFile("dist/icons/apple-touch-icon.png");
await readFile("dist/sw.js");
console.log(
  `PASS: aplicación instalable empaquetada con alcance ${base}, manifiesto, worker e iconos PNG válidos.`,
);
