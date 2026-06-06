import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

// GitHub Pages SPA fallback: public/404.html encodes the requested route into
// a query string (e.g. /Govviz/?/dhsc). Restore the real path before the
// router reads window.location. See rafgraph/spa-github-pages.
(function restoreSpaRoute() {
  const l = window.location;
  if (l.search[1] === "/") {
    const decoded = l.search
      .slice(1)
      .split("&")
      .map((s) => s.replace(/~and~/g, "&"))
      .join("?");
    window.history.replaceState(
      null,
      "",
      l.pathname.slice(0, -1) + decoded + l.hash,
    );
  }
})();

// Match the Vite `base` so routes resolve under the GitHub Pages subpath
// (e.g. /Govviz) in production and at root in dev.
const basepath = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";

const router = createRouter({ routeTree, basepath });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
