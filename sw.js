// Bump this version to force all clients to discard old caches and reload fresh.
// v4 → v5: React/Vite migration; old app.js + styles.css no longer exist.
const CACHE_NAME = "daily-brief-v5";

// ── Install: skip waiting so the new SW takes control immediately ────────────
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// ── Activate: wipe every old cache, then claim all clients ──────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for HTML + JSON data, cache-first for hashed assets ─
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const path = url.pathname;

  // Network-first: HTML documents and all JSON data files.
  // Ensures users always get the latest app shell and fresh stories/markets/briefing.
  const isNetworkFirst =
    path.endsWith(".html") ||
    path.endsWith(".json") ||
    path === "/daily-brief/" ||
    path === "/daily-brief";

  if (isNetworkFirst) {
    event.respondWith(
      fetch(new Request(event.request, { cache: "no-store" }))
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first: JS/CSS/fonts/images use content-hashed filenames — safe to cache forever.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
