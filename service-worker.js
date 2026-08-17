/**
 * service-worker.js — offline-first caching for سفر المزامير.
 * Strategy:
 *  - App shell (HTML/CSS/JS/manifest/icons): cache-first, populated on install.
 *  - Psalms dataset (data/psalms.json): cache-first with background refresh (stale-while-revalidate).
 *  - Audio files: cache-on-demand (only cached once actually played), never pre-cached in bulk.
 *  - Everything else same-origin: network-first with cache fallback.
 */

const CACHE_VERSION = 'psalms-v2';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const AUDIO_CACHE = `${CACHE_VERSION}-audio`;

const SHELL_ASSETS = [
  'index.html',
  'library.html',
  'psalm.html',
  'memorize.html',
  'review.html',
  'my-psalms.html',
  'settings.html',
  'about.html',
  'manifest.webmanifest',
  'css/style.css',
  'css/reader.css',
  'css/themes.css',
  'css/responsive.css',
  'js/app.js',
  'js/storage.js',
  'js/psalms.js',
  'js/search.js',
  'js/reader.js',
  'js/memorization.js',
  'js/review.js',
  'js/progress.js',
  'js/plans.js',
  'js/sharing.js',
  'js/pwa.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'data/psalms.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('psalms-') && ![SHELL_CACHE, DATA_CACHE, AUDIO_CACHE].includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isAudioRequest(url) {
  return url.pathname.includes('/audio/') || url.pathname.endsWith('.mp3');
}
function isDataRequest(url) {
  return url.pathname.endsWith('data/psalms.json');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // let cross-origin (e.g. fonts) pass through normally

  if (isAudioRequest(url)) {
    event.respondWith(cacheOnDemand(req, AUDIO_CACHE));
    return;
  }
  if (isDataRequest(url)) {
    event.respondWith(staleWhileRevalidate(req, DATA_CACHE));
    return;
  }
  event.respondWith(networkFirstWithCacheFallback(req, SHELL_CACHE));
});

async function cacheOnDemand(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'الصوت غير متاح بدون إنترنت' });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await networkPromise) || new Response('[]', { headers: { 'Content-Type': 'application/json' } });
}

async function networkFirstWithCacheFallback(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const fallback = await cache.match('index.html');
      if (fallback) return fallback;
    }
    return new Response('غير متصل ولا توجد نسخة محفوظة لهذه الصفحة', { status: 503 });
  }
}
