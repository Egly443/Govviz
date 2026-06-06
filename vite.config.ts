import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

// Deployed as a GitHub Pages project site at /Govviz/. Use the repo subpath
// for production asset URLs, but keep dev serving from root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/Govviz/" : "/",
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: false }),
    react(),
    tailwindcss(),
  ],
  build: {
    // Stable (non-hashed) asset filenames. GitHub Pages edge-caches index.html;
    // with hashed names a slightly-stale cached index can reference bundles a
    // newer deploy has already purged -> 404 -> blank page (even in incognito).
    // Stable names are overwritten in place each deploy, so a stale index still
    // resolves to existing files.
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
}));
