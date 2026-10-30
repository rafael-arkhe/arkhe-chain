const CACHE = 'arkhe-intra-offline-v2';
const ASSETS = ['/offline/index.html', '/offline/style.css', '/offline/app.mjs', '/offline/verify.mjs', '/verifier/arkhe_verify_wasm.js', '/verifier/arkhe_verify_wasm_bg.wasm'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('arkhe-intra-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => { const url = new URL(event.request.url); if (event.request.method === 'GET' && url.origin === self.location.origin && ASSETS.includes(url.pathname)) event.respondWith(fetch(event.request).catch(() => caches.match(url.pathname))); });
