import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [
    react(),
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
