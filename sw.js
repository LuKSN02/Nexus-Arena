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

const CACHE_VERSION = 'nexus-arena-v16';

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
  './js/newsletter-admin.js',
  './js/app.js',
  './assets/favicon-32.png',
  './assets/favicon-16.png',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-64.png',
  './privacy.html',
  './terms.html',
  './offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // cache: 'reload' ignora o cache HTTP do navegador — garante arquivos novos
      .then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
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

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  // SDK do Firebase: URLs com versão fixa (imutáveis) — pode ser cache-first.
  const isFirebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');

  // Todo o resto (Firestore, Discord, Worker, EmailJS, ViaCEP...) vai direto
  // para a rede: o service worker não deve interferir em chamadas de API,
  // nem trocar uma resposta de API por uma página HTML offline.
  if (!sameOrigin && !isFont && !isFirebaseSdk) return;

  // Fontes: network-first (não bloqueia offline, atualiza quando há conexão).
  if (isFont){
    event.respondWith(
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // SDK do Firebase: cache-first, guarda a 1ª resposta boa. Assim o app abre
  // offline depois da primeira visita.
  if (isFirebaseSdk){
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res && res.ok){
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return res;
      }))
    );
    return;
  }

  // Navegação (abrir página): rede primeiro; offline cai no index em cache.
  if (req.mode === 'navigate'){
    event.respondWith(
      fetch(req).then((res) => {
        const isRoot = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
        if (res && res.ok && isRoot){
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', clone));
        }
        return res;
      }).catch(() =>
        caches.match(req, { ignoreSearch: true })
          .then((c) => c || caches.match('./index.html'))
          .then((c) => c || caches.match('./offline.html'))
      )
    );
    return;
  }

  // Demais arquivos do site (JS, CSS, imagens): usa o cache na hora e
  // atualiza em segundo plano. ignoreSearch: as URLs do HTML trazem ?v=...,
  // mas o cache guarda a versão sem query — sem isso nunca dava "acerto".
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic'){
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
