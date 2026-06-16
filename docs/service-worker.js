// service-worker.js — caches everything for offline play on iPhone home screen
const CACHE = 'fameup-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/audio.js',
  './js/sprites.js',
  './js/input.js',
  './js/entities.js',
  './js/weapons.js',
  './js/waves.js',
  './js/coop.js',
  './js/game.js',
  './js/standoff.js',
  './js/fameup.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      // Cache assets one-by-one so a single 404 (e.g. missing music) doesn't kill install
      Promise.all(ASSETS.map(url => cache.add(url).catch(err => console.warn('cache miss', url, err))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first for HTML so updates show up; cache-first for everything else
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
