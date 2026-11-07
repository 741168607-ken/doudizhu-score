const CACHE = 'ddj-score-v32';
const APP_SHELL = [
  './', './index.html', './styles.css', './app.js', './game.js', './manifest.webmanifest',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/fonts/DS-Digital.woff', './assets/fonts/DS-Digital.ttf',
  './assets/images/logo.png', './assets/images/number-plate.png', './assets/images/score-board.png',
  './assets/images/dial.png', './assets/images/bomb-before.png', './assets/images/bomb-after.png',
  './assets/images/farmer-win.png', './assets/images/farmer-lose.png',
  './assets/images/landlord-win.png', './assets/images/landlord-lose.png',
  './assets/images/遮罩CD.png',
  './assets/images/我炸.wav', './assets/images/金币.wav', './assets/images/齿感音.wav', './assets/images/让开.wav', './assets/images/数字变化.wav'
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
    event.respondWith(fetch(event.request, { cache: 'no-cache' }).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put('./index.html', copy)); return response; }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(event.request, { cache: 'no-cache' }).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
