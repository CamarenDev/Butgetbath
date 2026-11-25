const CACHE = 'bbs-v10';
const OFFLINE = '/offline/';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/account/') || url.pathname.startsWith('/employee/') || url.pathname.startsWith('/estimator/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (/\.(css|js|svg|png|webp|jpg)$/.test(url.pathname)) {
    // Network first so a new release is never hidden behind stale cached styles or scripts.
    event.respondWith(fetch(request).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(request, copy)); } return res; }).catch(() => caches.match(request)));
  }
});
