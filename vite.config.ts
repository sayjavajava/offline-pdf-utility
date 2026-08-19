/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { viteSingleFile } from "vite-plugin-singlefile";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "./",
  server: {
    host: "::",
    port: 8080,
  },
  // The app ships as a folder users open straight from disk. Over file:// the
  // page origin is "null", and both module scripts and CSS-referenced fonts are
  // fetched in CORS mode — so a normal Vite build never boots there, whatever
  // the router does. Emitting one self-contained HTML file with every asset
  // inlined is what actually makes the documented offline usage work.
  // Classic (iife) workers: module workers fail to start from file://.
  worker: { format: 'iife' },
  build: {
    // Fonts are ~260KB total; inline them as data: URIs rather than leaving
    // them as sibling files that file:// will refuse to fetch.
    assetsInlineLimit: 2 * 1024 * 1024,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    viteSingleFile(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Colocated with the build config so the "@" alias above is shared rather
  // than duplicated in a separate vitest config, where the two would drift.
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      // src/lib is the whole product; the vendored shadcn primitives are not
      // ours and would only dilute the number.
      include: ["src/lib/**", "src/components/tools/**"],
      // Excluded because they cannot execute under jsdom at all, not because
      // they are untested: each needs a real canvas, Worker, or HTML renderer.
      // Their behaviour is covered by the Playwright checks against the
      // file:// build. Counting them here would only invite fake tests written
      // to move a number.
      exclude: [
        "src/lib/pdf-render.ts", // pdf.js: needs a canvas and a live worker
        "src/lib/pdf.worker.ts", // worker entry: no Worker in jsdom
        "src/lib/qpdf-engine.ts", // qpdf-wasm: Node's fetch cannot load a data: URI the way a browser does
        "src/lib/pdf-redact.ts", // rasterizes via pdf.js + createImageBitmap/canvas — same as pdf-render.ts; its pure coordinate math (toPixelRect) and validation paths are still covered by pdf-redact.test.ts, just not counted here since the file as a whole can't run under jsdom
      ],
      // A ratchet, not an aspiration: these sit just below what the suite
      // currently achieves, so a regression fails the build. Raise them as
      // coverage improves; do not lower them to make a red run green.
      thresholds: {
        lines: 85,
        functions: 65,
        branches: 70,
        statements: 82,
        "src/lib/**": { lines: 90, functions: 90, branches: 75, statements: 90 },
      },
    },
  },
}));
