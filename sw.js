// Offline support: serve the app's own files from cache, refreshing them in the
// background so an update shows up on the next launch. GitHub API calls are untouched.
const CACHE = "hiragana-v1";
const FILES = [
  "./", "index.html", "css/style.css", "manifest.webmanifest",
  "js/app.js", "js/data.js", "js/store.js", "js/merge.js", "js/sync.js",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    if (cached) {
      e.waitUntil(fresh.catch(() => {}));
      return cached;
    }
    return fresh;
  }));
});
