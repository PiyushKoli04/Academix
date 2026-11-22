const CACHE_VERSION = "academix-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/base.css",
  "./css/components.css",
  "./css/layout.css",
  "./css/pages.css",
  "./css/admin.css",
  "./js/app.js",
  "./js/firebase.js",
  "./firebase.config.js",
  "./js/auth.js",
  "./js/state.js",
  "./js/ui.js",
  "./js/drive.js",
  "./js/db.js",
  "./js/seed.js",
  "./js/services/driveUpload.js",
  "./js/pages/home.js",
  "./js/pages/library.js",
  "./js/pages/subject.js",
  "./js/pages/viewer.js",
  "./js/pages/bookmarks.js",
  "./js/pages/profile.js",
  "./js/pages/about.js",
  "./js/pages/admin/shared.js",
  "./js/pages/admin/dashboard.js",
  "./js/pages/admin/structure.js",
  "./js/pages/admin/documents.js",
  "./js/pages/admin/contributors.js",
  "./js/pages/admin/ads.js",
  "./js/pages/admin/users.js",
  "./icons/favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request, "./index.html"));
      return;
    }
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request, FONT_CACHE));
  }
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response("Academix is offline and this file is not cached yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) cache.put(request, response.clone());
  return response;
}
