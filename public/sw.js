// Hand-written service worker per CLAUDE.md's stack decision — no
// unmaintained Next-13-era SW build plugin, no Workbox-scale precaching
// toolchain, both overkill for two event handlers.
//
// skipWaiting/clients.claim so the worker takes control immediately on
// every deploy and never gets stuck serving a stale version.
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

// PUSH-06/T-02-22: the notification-display call below is unconditional on
// EVERY push event — no branch (e.g. an `if (isProbe) return`) may ever
// skip it. A silent
// push (a push event that never surfaces a notification) is exactly the
// pattern browsers use to heuristically revoke a site's push permission
// (02-RESEARCH.md Pitfall 4). `data` is Plan 02-04's buildContentFreePayload
// shape: fixed locale title/body plus a signed `vid` token, never the
// triggering message's own text.
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.data && data.data.conversationId ? `conv-${data.data.conversationId}` : undefined,
      data: data.data,
    }),
  );
});

// ID-04/T-02-23: reads the vid token from the notification's OWN `data`
// field — set server-side at send time and never client-editable after
// delivery — and reopens the SAME conversation the push was about.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const vid = event.notification.data && event.notification.data.vid;
  const url = vid ? `/?vid=${vid}` : "/";
  event.waitUntil(self.clients.openWindow(url));
});
