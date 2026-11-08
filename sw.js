// Offline shell: the app files are cached, data always comes from Supabase.
const CACHE = 'morti-web-v1';
const FILES = ['./', 'index.html', 'app.css', 'manifest.webmanifest',
  'main.js', 'config.js', 'i18n.js', 'i18n-data.js', 'api.js', 'store.js', 'study.js', 'ui.js',
  'chat.js', 'views-auth.js', 'views-user.js', 'views-admin.js', 'csv.js',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // Supabase etc. = network only
  // network first (so updates arrive), cache as fallback
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
