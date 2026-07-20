// Hand-written service worker per CLAUDE.md's stack decision — no
// unmaintained Next-13-era SW build plugin, no Workbox-scale precaching
// toolchain, both overkill for two event handlers.
//
// Phase 1 scaffold only. skipWaiting/clients.claim so the worker takes
// control immediately on every deploy and never gets stuck serving a stale
// version. No `push` or `notificationclick` handlers yet — those, plus
// registering this file client-side, are Phase 2
// (01-RESEARCH.md's Architectural Responsibility Map: "Push gate shell" —
// only the manifest + SW registration scaffolding ships in Phase 1).
//
// Served with Cache-Control: no-cache (next.config.ts) so a newer version
// of this file always replaces a previously-installed one — an
// un-updatable service worker is the trap CLAUDE.md calls out explicitly.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
