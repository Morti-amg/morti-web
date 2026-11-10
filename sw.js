// Offline shell: the app files are cached, data always comes from Supabase.
const CACHE = 'morti-web-v3';
const FILES = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/main.js', 'js/config.js', 'js/i18n.js', 'js/i18n-data.js', 'js/i18n-extra.js', 'js/api.js', 'js/store.js', 'js/study.js', 'js/ui.js',
  'js/chat.js', 'js/views-auth.js', 'js/views-user.js', 'js/views-admin.js', 'js/csv.js', 'js/grammar.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

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
