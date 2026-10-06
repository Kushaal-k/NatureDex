const CACHE = 'naturedex-shell-__BUILD_ID__';
self.addEventListener('install', event => {
  event.waitUntil(fetch('/precache.json', {cache:'no-store'}).then(response => {
    if (!response.ok) throw new Error('App files could not be cached');
    return response.json();
  }).then(urls => caches.open(CACHE).then(cache => cache.addAll(urls))));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith('naturedex-shell-') || key === 'naturedex-v1') && key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/photos')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match('/')).then(cached => cached || Response.error())));
    return;
  }
  // Hashed scripts, illustrations, and icons are already in this build's cache.
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
