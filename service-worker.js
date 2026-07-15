const CACHE_NAME = "bookkeeping2607-pwa-v28";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./service-worker.js",
  "./assets/black-shiba-mascot.png",
  "./assets/black-shiba-mascot-active.png"
];

const CORE_PATHS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/service-worker.js",
  "/assets/black-shiba-mascot.png",
  "/assets/black-shiba-mascot-active.png"
];

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isCoreRequest(request) {
  if (!isSameOrigin(request)) return false;
  const pathname = new URL(request.url).pathname;
  return CORE_PATHS.some((path) => pathname.endsWith(path));
}

function indexCacheRequest() {
  return new Request(new URL("./index.html", self.registration.scope).toString());
}

async function cacheResponse(request, response) {
  if (!response || !response.ok || !isSameOrigin(request)) return response;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch (_) {
    // A full or unavailable cache must never prevent the live response from opening.
  }
  return response;
}

async function cachedCoreResponse(request, fallbackToIndex = false) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  if (fallbackToIndex) return cache.match(indexCacheRequest());
  return undefined;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !isSameOrigin(event.request)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheResponse(indexCacheRequest(), response))
        .catch(() => cachedCoreResponse(event.request, true))
    );
    return;
  }

  if (isCoreRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheResponse(event.request, response))
        .catch(() => cachedCoreResponse(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => cacheResponse(event.request, response));
    })
  );
});
