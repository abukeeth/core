// OrderVora service worker — offline resilience for the Kitchen Display.
//
// Strategy: NETWORK-FIRST with a runtime-cache fallback. When online, every
// request goes to the network first, so content is never stale. When the
// network is unavailable (a kitchen Wi-Fi blip), previously-fetched pages and
// assets are served from cache so the KDS keeps running instead of showing the
// browser's offline error. Dynamic API data (/api/*) is intentionally NEVER
// cached — the KDS caches its own last queue in localStorage, so a stale API
// response can never be mistaken for live orders.
//
// Deliberately dependency-free (no Serwist/Workbox) to avoid a build-plugin
// requirement in this project's toolchain.

const CACHE = "ordervora-v1";
const PRECACHE_URLS = ["/icon.svg", "/manifest.webmanifest"];
const KDS_SHELL = "/dashboard/kitchen";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // third-party: leave to the browser
  if (url.pathname.startsWith("/api/")) return; // dynamic data: network only, never cached

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches
            .open(CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => undefined);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match(KDS_SHELL);
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
