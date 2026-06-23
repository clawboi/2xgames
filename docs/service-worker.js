// service-worker.js — caches everything for offline play on iPhone home screen
const CACHE = 'fameup-v0-37-0';
const ASSETS = [
  './',
  './index.html',
  './crabcage.html',
  './manifest.json',
  './manifest-crabcage.json',
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
  './js/hq.js',
  './js/fameup_customize.js',
  './js/fameup.js',
  './icons/FU.io.png',
  './icons/FU.io.png',
  './icons/crabcageicon.PNG',
  './icons/crabcageicon.PNG',
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
  // Network-first for EVERYTHING so code updates always show.
  // Falls back to cache when offline (still PWA-capable).
  e.respondWith(
    fetch(e.request).then(resp => {
      // Stash a fresh copy in cache for offline use
      if (resp && resp.status === 200 && e.request.method === 'GET') {
        const respClone = resp.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, respClone)).catch(() => {});
      }
      return resp;
    }).catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
  );
});

// Handle SKIP_WAITING message from clients to activate new SW immediately
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
