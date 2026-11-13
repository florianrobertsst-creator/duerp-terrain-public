// Mise en cache de l'application pour qu'elle fonctionne hors connexion.
const CACHE = 'duerp-terrain-v9';
const FICHIERS = ['./', './index.html', './app.js', './styles.css', './risques.js', './manifest.webmanifest', './icone-192.png', './icone-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((rep) => { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put(e.request, copie)); return rep; }).catch(() => caches.match('./index.html'))));
});
