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
}));
