const CACHE_NAME = 'mis-finanzas-v9';

const FILES_TO_CACHE = [
  './',
  './index.html',
  './recurrence.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const EXTERNOS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key.startsWith('mis-finanzas-') && key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La app: primero internet (siempre la última versión); sin conexión o si tarda más de 4 s, usa la copia guardada.
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      Promise.race([
        fetch(req),
        new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 4000))
      ])
        .then(res => {
          if (!res || !res.ok) throw new Error('Respuesta de red no válida');
          const copia = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copia).catch(() => {}));
          return res;
        })
        .catch(() => caches.open(CACHE_NAME).then(cache =>
          cache.match('./index.html').then(hit => hit || cache.match('./'))
        ))
    );
    return;
  }

  // Íconos, librerías (gráficos, Excel, PDF) y tipografías: se guardan la primera vez y luego funcionan sin internet.
  if (url.origin === self.location.origin || EXTERNOS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => cache.match(req).then(guardado => {
        const red = fetch(req)
          .then(res => {
            if (!res || !res.ok) throw new Error('Respuesta de red no válida');
            const copia = res.clone();
            cache.put(req, copia).catch(() => {});
            return res;
          })
          .catch(() => guardado);
        return guardado || red;
      }))
    );
  }
});
