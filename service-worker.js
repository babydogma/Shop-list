const CACHE = "shopping-list-v5";
const FILES = [
    "./",
    "./index.html",
    "./archive.html",
    "./style.css",
    "./script.js",
    "./manifest.json"
];

self.addEventListener("install", event => {
    self.skipWaiting();
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    if (event.request.mode === "navigate") {
        event.respondWith(fetch(event.request).catch(() => caches.match("./index.html")));
        return;
    }

    event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
