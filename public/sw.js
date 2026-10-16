/* El caché conserva la interfaz; IndexedDB conserva los datos. */
importScripts('./storage.js', './sync.js');
const CACHE = 'mi-agenda-shell-v1';
const ASSETS = ['./', './index.html', './styles.css', './config.js', './app.js', './storage.js', './sync.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(asset => new URL(asset, self.registration.scope).href))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mi-agenda-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Las respuestas de la API nunca se simulan ni se sirven desde el caché.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') ||
    !url.href.startsWith(self.registration.scope) || !ASSETS.some(asset => new URL(asset, self.registration.scope).href === url.href)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request);
    return cached || fetch(event.request);
  }));
});
self.addEventListener('sync', event => {
  if (event.tag !== 'agenda-pending') return;
  event.waitUntil(AgendaSync.run().then(async () => {
    const pages = await self.clients.matchAll({ type: 'window' });
    pages.forEach(page => page.postMessage({ type: 'AGENDA_SYNCED' }));
  }));
});
