// Cookieless, privacy-first pageview analytics via GoatCounter.
//
// It is a no-op unless `VITE_GOATCOUNTER` is set at build time, e.g.
//   VITE_GOATCOUNTER="https://YOURCODE.goatcounter.com/count"
// (set it as a repo/Actions variable — see deploy.yml and the README). With no
// value, no script is loaded and nothing is tracked, so local/dev builds stay
// clean and the app never ships a tracker by accident.
//
// GoatCounter is GDPR/PECR-friendly: no cookies, no personal data, IPs are only
// used transiently to derive country and are not stored — so no consent banner
// is required. It gives counts, referrers, countries and (via UTM-tagged share
// links) channel attribution — it does NOT identify individuals.

const ENDPOINT = import.meta.env.VITE_GOATCOUNTER as string | undefined;

declare global {
  interface Window {
    goatcounter?: {
      count?: (vars: { path?: string; title?: string; referrer?: string }) => void;
      no_onload?: boolean;
    };
  }
}

/** Inject the GoatCounter beacon once. It auto-counts the initial pageview. */
export function initAnalytics(): void {
  if (
    !ENDPOINT ||
    typeof document === "undefined" ||
    document.getElementById("goatcounter")
  ) {
    return;
  }
  const s = document.createElement("script");
  s.id = "goatcounter";
  s.async = true;
  s.src = "//gc.zgo.at/count.js";
  s.setAttribute("data-goatcounter", ENDPOINT);
  document.head.appendChild(s);
}

/**
 * Count an SPA navigation. The first (initial) pageview is counted by the beacon
 * itself on load, so callers should skip the first router resolve and only
 * report subsequent navigations. Safe to call before the script has loaded.
 */
export function trackPageview(path: string): void {
  if (!ENDPOINT) return;
  window.goatcounter?.count?.({ path });
}
