/* SL FINANCEIRO PREMIUM — Service Worker offline
   Compatível com SL_FINANCEIRO_V3.html e com publicação como index.html.
   Coloque este arquivo na MESMA PASTA do HTML e publique em HTTPS.
*/
'use strict';

const CACHE_PREFIX = 'sl-financeiro-premium-';
const CACHE_NAME = CACHE_PREFIX + 'offline-v4';
const APP_FILES = ['SL_FINANCEIRO_V3.html', 'index.html'];
const APP_URLS = APP_FILES.map(name => new URL(name, self.registration.scope).href);
const SCOPE_URL = self.registration.scope;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    let savedApp = false;

    // Não usar addAll: um arquivo opcional ausente não deve cancelar toda a instalação.
    for (const url of APP_URLS) {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) {
          await cache.put(url, response.clone());
          savedApp = true;
        }
      } catch (_) {
        // Tenta o próximo nome de arquivo.
      }
    }

    // Guarda a rota principal quando o servidor a disponibilizar.
    try {
      const response = await fetch(SCOPE_URL, { cache: 'reload' });
      if (response.ok) await cache.put(SCOPE_URL, response.clone());
    } catch (_) {}

    if (!savedApp) {
      throw new Error('Não foi possível localizar SL_FINANCEIRO_V3.html nem index.html na pasta do sw.js.');
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put(request, response.clone());
          // Também mantém uma cópia da página acessada como fallback offline.
          const path = new URL(request.url);
          if (APP_URLS.includes(path.href)) await cache.put(path.href, response.clone());
        }
        return response;
      } catch (_) {
        const exact = await cache.match(request);
        if (exact) return exact;
        for (const appUrl of APP_URLS) {
          const app = await cache.match(appUrl);
          if (app) return app;
        }
        const home = await cache.match(SCOPE_URL);
        if (home) return home;
        return new Response('Aplicativo indisponível offline. Conecte-se à internet uma vez para carregar e armazenar o sistema.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Recursos do mesmo domínio: cache primeiro, rede como alternativa.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
