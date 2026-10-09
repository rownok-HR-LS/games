// GitHub Pages lets browsers reuse a cached page for ~10 minutes, so right after a deploy a
// player can get the old game. On load, ask the server (bypassing the cache) which build is
// live; if it differs from this copy, reload once to pick up the new one.
declare const __BUILD_ID__: string;

export function reloadIfStale() {
  if (__BUILD_ID__ === "dev") return;
  const key = `reloaded-for:${location.pathname}`;
  fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((v: { build?: string } | null) => {
      if (!v?.build || v.build === __BUILD_ID__) return;
      // Guard against a reload loop if the CDN is still catching up.
      if (sessionStorage.getItem(key) === v.build) return;
      sessionStorage.setItem(key, v.build);
      location.reload();
    })
    .catch(() => {});
}
