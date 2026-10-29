/* Doruk Kasa - çevrimdışı çalışma için önbellek.
   Uygulama dosyaları güncellendiğinde VERSION değerini artırın (v3, v4...). */
const VERSION = "doruk-kasa-v3";
const FILES = ["./", "./index.html", "./app.js", "./config.js", "./logo.jpg", "./manifest.webmanifest",
  "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png"];
const FB = "https://www.gstatic.com/firebasejs/";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* Uygulama dosyaları ve Firebase kütüphanesi: önce önbellek (internet olmasa da açılır), arka planda güncelle.
   Veritabanı trafiği (firestore.googleapis.com vb.) önbelleğe alınmaz. */
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const mine = url.origin === location.origin, fb = req.url.startsWith(FB);
  if (!mine && !fb) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: mine });
    const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (cached) { e.waitUntil(net); return cached; }
    return (await net) || (mine && req.mode === "navigate" ? cache.match("./index.html") : Response.error());
  }));
});
