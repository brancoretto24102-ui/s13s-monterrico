import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const fontRoot = new URL(
  "./node_modules/pdfjs-dist/standard_fonts/",
  import.meta.url,
);
const fontFiles = () =>
  readdirSync(fontRoot).filter(
    (name) => /\.(pfb|ttf)$/.test(name) || name.startsWith("LICENSE_"),
  );
export default defineConfig({
  plugins: [
    react(),
    {
      name: "pdf-preview-fonts",
      configureServer(server) {
        const allowed = new Set(fontFiles());
        server.middlewares.use((req, res, next) => {
          const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
          const prefix = `${server.config.base}pdf-assets/standard_fonts/`;
          if (!pathname.startsWith(prefix)) return next();
          const name = pathname.slice(prefix.length);
          if (!allowed.has(name)) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader(
            "Content-Type",
            name.startsWith("LICENSE_")
              ? "text/plain"
              : "application/octet-stream",
          );
          res.end(readFileSync(new URL(name, fontRoot)));
        });
      },
      generateBundle() {
        for (const name of fontFiles())
          this.emitFile({
            type: "asset",
            fileName: `pdf-assets/standard_fonts/${name}`,
            source: readFileSync(fileURLToPath(new URL(name, fontRoot))),
          });
        this.emitFile({
          type: "asset",
          fileName: "pdf-assets/LICENSE_PDFJS",
          source: readFileSync(
            new URL("./node_modules/pdfjs-dist/LICENSE", import.meta.url),
          ),
        });
      },
    } satisfies Plugin,
    {
      name: "dev-csp",
      apply: "serve",
      transformIndexHtml: (html: string) =>
        html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*\/>/, ""),
    },
  ],
  base: process.env.VITE_BASE_PATH || "/",
  build: { sourcemap: false },
  test: { include: ["tests/**/*.test.ts"] },
} as any);
