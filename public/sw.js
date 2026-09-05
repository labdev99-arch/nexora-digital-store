/* Nexora PWA: offline shell, cached catalog, safe background sync and push. */
const VERSION = 'nexora-v11-1',
  SHELL_CACHE = `${VERSION}-shell`,
  DATA_CACHE = `${VERSION}-data`;
const SHELL = [
  '/en',
  '/ar',
  '/en/offline',
  '/ar/offline',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];
const QUEUE_DB = 'nexora-offline-actions',
  QUEUE_STORE = 'requests';
const SAFE_QUEUE_PATHS = ['/api/cart', '/api/support/', '/api/reviews/'];
self.addEventListener('install', (event) =>
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  )
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) => key.startsWith('nexora-') && ![SHELL_CACHE, DATA_CACHE].includes(key)
              )
              .map((key) => caches.delete(key))
          )
        ),
      self.clients.claim()
    ])
  )
);
const localeFallback = (url) => (url.pathname.startsWith('/ar') ? '/ar/offline' : '/en/offline');
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ||
            (await caches.match(localeFallback(url))) ||
            Response.error()
        )
    );
    return;
  }
  if (
    url.pathname.startsWith('/api/ai/recommendations') ||
    url.pathname.startsWith('/api/v1/products') ||
    url.pathname.startsWith('/api/v1/prices')
  ) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fresh = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached || Response.error());
        return cached || fresh;
      })
    );
    return;
  }
  if (['style', 'script', 'font', 'image'].includes(request.destination))
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok)
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
            return response;
          })
      )
    );
});
function openQueue() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(QUEUE_STORE, {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function storeQueued(item) {
  const db = await openQueue();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function replayQueue() {
  const db = await openQueue();
  const items = await new Promise((resolve, reject) => {
    const request = db.transaction(QUEUE_STORE).objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
        credentials: 'include'
      });
      if (!response.ok && response.status >= 500) continue;
      db.transaction(QUEUE_STORE, 'readwrite').objectStore(QUEUE_STORE).delete(item.id);
    } catch {
      break;
    }
  }
}
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'QUEUE_ACTION') {
    const item = event.data.item,
      path = new URL(item.url, self.location.origin).pathname;
    if (item.method !== 'POST' || !SAFE_QUEUE_PATHS.some((prefix) => path.startsWith(prefix)))
      return;
    event.waitUntil(
      storeQueued(item).then(() => self.registration.sync?.register('nexora-actions'))
    );
  }
});
self.addEventListener('sync', (event) => {
  if (event.tag === 'nexora-actions') event.waitUntil(replayQueue());
});
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Nexora', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/favicon-32.png',
      data: {url: payload.url || '/'},
      tag: payload.tag || undefined,
      renotify: Boolean(payload.tag)
    })
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then((windows) => {
      const target = event.notification.data?.url || '/',
        existing = windows.find((client) => new URL(client.url).pathname === target);
      return existing ? existing.focus() : clients.openWindow(target);
    })
  );
});
