// Windy works offline: the app shell is cached, the AI call is never cached.
// Network first, so a new version always shows up as soon as you're online.
const CACHE = 'windy-v18';
const SHELL = ['./', 'index.html', 'css/windy.css', 'js/app.js', 'js/i18n.js', 'js/estimate.js', 'js/foods.js', 'js/goal.js', 'js/fx.js', 'js/settings.js', 'js/weekly.js', 'js/summary.js', 'js/icons.js', 'js/swipe.js', 'js/water.js', 'js/tip.js', 'js/sync.js', 'js/barcode.js', 'js/coach.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
