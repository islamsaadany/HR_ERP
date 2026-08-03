/*
 * Minimal service worker for installability (PWA "Add to Home Screen").
 * Intentionally does NOT cache pages — this is an authenticated app, so we let every
 * request hit the network normally and avoid serving stale or cross-user content.
 * The presence of a fetch handler is what satisfies the install criteria.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // No-op: fall through to the browser's default network handling.
});
