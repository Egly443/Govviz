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
        // Split all third-party code into a single stable-named `vendor` chunk
        // so it caches independently of app code (which changes far more often).
        // A single vendor chunk is deliberate: finer splits (separating recharts
        // from React) create circular chunk dependencies — Rollup then can't
        // guarantee module-evaluation order across chunks, which crashes at load
        // with a TDZ "Cannot access X before initialization" (recharts reads
        // prop-types at module-eval time). One vendor chunk keeps the whole
        // third-party graph in one correctly-ordered file.
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
}));
