/**
 * Axon Memory service worker.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS DELIBERATELY NOT FOR
 *
 * On a phone the network drops constantly — lift, tunnel, dead spot. Without a
 * worker this app is a Vite SPA served from a CDN, so a dropped connection at
 * the wrong moment is a white screen with nothing on it. This keeps the app
 * SHELL available so the thing at least opens and can say what is wrong.
 *
 * It does NOT cache Supabase responses or anything under /auth. Memory is the
 * product here: serving a stale answer from cache would show something that
 * looks current and is not, and the whole point of Axon is that what it tells
 * you was actually remembered. A visible "offline" beats a confident wrong
 * answer.
 *
 * Cache-first for hashed build assets (Vite fingerprints them, so a given URL
 * is immutable), network-first for navigations so a deploy is picked up
 * immediately rather than after a cache expiry nobody can predict.
 */
const VERSION = 'axon-v1';
const SHELL = `${VERSION}-shell`;

/** Only the shell. Everything else is fetched. */
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      // addAll is atomic: one 404 throws the whole install away. That is the
      // behaviour worth having — a half-cached shell fails in ways that are
      // very hard to reproduce.
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch another origin, the API, or auth. Caching a cross-origin
  // response we cannot read tells us nothing, and caching a session response
  // is how someone ends up looking at another login's state.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) return;

  // Navigations: network first, shell as the fallback. This is what turns a
  // dead connection into "the app opened and told me" instead of a blank page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then(r => r ?? Response.error())),
    );
    return;
  }

  // Hashed build assets are immutable, so cache-first is safe and is the
  // difference between a cold open and an instant one.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(hit => hit ?? fetch(request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          void caches.open(SHELL).then(c => c.put(request, copy));
        }
        return res;
      })),
    );
  }
});
