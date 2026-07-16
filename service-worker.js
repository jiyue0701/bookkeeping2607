const CACHE_NAME = "bookkeeping2607-pwa-v34";

const CORE_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest"
];

const VISUAL_FILES = [
  "./assets/black-shiba-mascot.png",
  "./assets/mint-paper-texture.webp",
  "./assets/icons/home.svg",
  "./assets/icons/receipt-2.svg",
  "./assets/icons/chart-pie.svg",
  "./assets/icons/user-circle.svg",
  "./assets/icons/pencil.svg"
];

const CORE_PATHS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest"
];

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isCoreRequest(request) {
  if (!isSameOrigin(request)) return false;
  const pathname = new URL(request.url).pathname;
  return CORE_PATHS.some((path) => pathname.endsWith(path));
}

function scopedRequest(path) {
  return new Request(new URL(path, self.registration.scope).toString());
}

function indexCacheRequest() {
  return scopedRequest("./index.html");
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

async function cachedResponse(request, fallbackToIndex = false) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  if (fallbackToIndex) return cache.match(indexCacheRequest(), { ignoreSearch: true });
  return undefined;
}

async function seedVisualFile(cache, path) {
  const request = scopedRequest(path);
  const existing = await caches.match(request, { ignoreSearch: true });
  if (existing) {
    await cache.put(request, existing);
    return;
  }
  try {
    const response = await fetch(request, { cache: "force-cache" });
    if (response.ok) await cache.put(request, response);
  } catch (_) {
    // Visuals can be filled on demand; a slow image must not break the app update.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const coreRequests = CORE_FILES.map((path) => new Request(
      new URL(path, self.registration.scope).toString(),
      { cache: "reload" }
    ));
    await cache.addAll(coreRequests);
    await Promise.all(VISUAL_FILES.map((path) => seedVisualFile(cache, path)));
    await self.skipWaiting();
  })());
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
    const cacheKey = indexCacheRequest();
    const networkResponse = fetch(event.request)
      .then((response) => cacheResponse(cacheKey, response));
    event.waitUntil(networkResponse.then(() => undefined).catch(() => undefined));
    event.respondWith(
      cachedResponse(cacheKey, true)
        .then((cached) => cached || networkResponse)
        .catch(() => cachedResponse(cacheKey, true))
    );
    return;
  }

  if (isCoreRequest(event.request)) {
    const networkResponse = fetch(event.request)
      .then((response) => cacheResponse(event.request, response));
    event.waitUntil(networkResponse.then(() => undefined).catch(() => undefined));
    event.respondWith(
      cachedResponse(event.request)
        .then((cached) => cached || networkResponse)
        .catch(() => cachedResponse(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => cacheResponse(event.request, response));
    })
  );
});
