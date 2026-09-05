/* ==========================================================================
   sw.js — Service Worker
   --------------------------------------------------------------------------
   Estratégia: "cache-first" para o app shell (HTML/CSS/JS/ícones), com
   atualização em segundo plano. Isso permite abrir o site offline (ou com
   conexão instável) depois da primeira visita, e é um dos requisitos para
   o navegador oferecer "Instalar app" (PWA).

   Importante: Service Workers só funcionam em contexto seguro — ou seja,
   via http://localhost ou https://, nunca abrindo o index.html direto do
   disco (file://). Veja o README para como rodar um servidor local.
   ========================================================================== */

const CACHE_VERSION = 'nexus-arena-v7';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/firebase-init.js',
  './js/icons.js',
  './js/utils.js',
  './js/db.js',
  './js/data.js',
  './js/api.js',
  './js/app.js',
  './assets/favicon-32.png',
  './assets/favicon-16.png',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-64.png',
  './offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Fontes do Google Fonts: network-first (não bloqueia o app se offline, mas
  // busca versão atualizada quando há conexão).
  if (req.url.includes('fonts.googleapis.com') || req.url.includes('fonts.gstatic.com')){
    event.respondWith(
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // App shell: cache-first, com atualização silenciosa em segundo plano.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic'){
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached || caches.match('./offline.html'));

      return cached || networkFetch;
    })
  );
});
