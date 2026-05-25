// Cache version — bump this string whenever you want all clients to get a fresh cache.
const CACHE_NAME = "daily-brief-v4";

// App shell: static assets that are safe to cache long-term.
// stories.json is intentionally excluded — it is fetched network-first (see below).
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json"
];

// ── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: delete any old caches (e.g. daily-brief-v1) ───────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: split strategy ────────────────────────────────────────────────────
//
//  • stories.json  → NETWORK-FIRST
//      Always try the network so users always get today's edition.
//      Fall back to cache only when the network is completely unavailable
//      (e.g. the user is genuinely offline).
//
//  • Everything else → CACHE-FIRST
//      Serve from cache for speed; fall back to network on a miss.
//
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isStoriesJson = url.pathname.endsWith("stories.json");

  if (isStoriesJson) {
    // Network-first: always fetch fresh from network, bypassing HTTP cache.
    // Fall back to SW cache only when offline.
    const networkRequest = new Request(url.href, { cache: "reload" });
    event.respondWith(
      fetch(networkRequest)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(url.href, clone));
          return networkResponse;
        })
        .catch(() => {
          return caches.match(url.href);
        })
    );
  } else {
    // Cache-first: fast loads for static assets.
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request);
      })
    );
  }
});
