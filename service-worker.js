const CACHE_NAME = "bookkeeping2607-pwa-v29";
const ICON_FILES = [
  "apple.svg", "arrow-back-up.svg", "arrow-up-circle.svg", "book-2.svg", "bottle.svg",
  "briefcase.svg", "building-cottage.svg", "calendar.svg", "camera.svg", "car.svg",
  "cash-banknote.svg", "chart-bar.svg", "chart-line.svg", "chart-pie.svg", "chevron-left.svg",
  "chevron-right.svg", "clock-hour-4.svg", "cloud.svg", "credit-card.svg", "cup.svg",
  "currency-yuan.svg", "database.svg", "device-gamepad-2.svg", "device-mobile.svg", "dots.svg",
  "equal.svg", "file-download.svg", "file-upload.svg", "friends.svg", "gift.svg",
  "gift-card.svg", "home.svg", "ice-cream-2.svg", "message-circle.svg", "music.svg",
  "package.svg", "paw.svg", "pencil.svg", "pill.svg", "plus.svg", "receipt-2.svg",
  "refresh.svg", "run.svg", "salad.svg", "school.svg", "settings.svg", "shirt.svg",
  "shopping-bag.svg", "sparkles.svg", "star.svg", "sun.svg", "tag.svg",
  "tools-kitchen-2.svg", "trash.svg", "user-circle.svg", "users.svg", "wallet.svg", "x.svg"
].map((name) => `./assets/icons/${name}`);

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./service-worker.js",
  "./assets/black-shiba-mascot.png",
  "./assets/black-shiba-mascot-active.png",
  "./assets/mint-paper-texture.webp",
  ...ICON_FILES
];

const CORE_PATHS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/service-worker.js",
  "/assets/black-shiba-mascot.png",
  "/assets/black-shiba-mascot-active.png",
  "/assets/mint-paper-texture.webp"
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
