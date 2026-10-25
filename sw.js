const CACHE = 'ddj-score-v3';
const APP_SHELL = [
  './', './index.html', './styles.css', './app.js', './game.js', './manifest.webmanifest',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/images/role-default.webp', './assets/images/landlord-win.webp',
  './assets/images/landlord-lose.webp', './assets/images/farmer-win.webp', './assets/images/farmer-lose.webp',
  './assets/images/bomb-ready.webp', './assets/images/bomb-boom.webp'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put('./index.html', copy)); return response; }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
