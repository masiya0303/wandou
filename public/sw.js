const CACHE = 'wandou-v1'
self.addEventListener('install', e => { self.skipWaiting() })
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()) })
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).then(r => {
    const clone = r.clone()
    caches.open(CACHE).then(c => c.put(e.request, clone))
    return r
  }).catch(() => caches.match(e.request)))
})
