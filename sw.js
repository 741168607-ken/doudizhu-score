const CACHE = 'ddj-score-v33';
const APP_SHELL = [
  './', './index.html', './styles.css', './app.js', './game.js', './manifest.webmanifest',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/fonts/DS-Digital.woff', './assets/fonts/DS-Digital.ttf',
  './assets/images/logo.png', './assets/images/number-plate.jpg', './assets/images/score-board.jpg',
  './assets/images/dial.png', './assets/images/bomb-before.png', './assets/images/bomb-after.png',
  './assets/images/farmer-win.jpg', './assets/images/farmer-lose.jpg',
  './assets/images/landlord-win.jpg', './assets/images/landlord-lose.jpg',
  './assets/images/遮罩CD.png',
  './assets/images/我炸.mp3', './assets/images/金币.mp3', './assets/images/齿感音.mp3', './assets/images/让开.mp3', './assets/images/数字变化.mp3'
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
