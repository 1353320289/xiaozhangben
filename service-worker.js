const CACHE_NAME = "piecework-calendar-v47";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=47",
  "./app.js?v=47",
  "./vendor/supabase.min.js?v=47",
  "./manifest.webmanifest?v=47",
  "./assets/icon.svg",
  "./assets/notebook.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const request = event.request;
  const shouldRefresh =
    request.mode === "navigate" ||
    ["document", "script", "style", "manifest"].includes(request.destination);

  if (shouldRefresh) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ||
      (request.mode === "navigate" ? cache.match("./index.html") : Response.error());
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}
