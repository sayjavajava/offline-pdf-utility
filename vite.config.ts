import { defineConfig } from "vite";
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
}));
