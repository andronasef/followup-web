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
  // event.data.json() throws on a non-JSON payload (e.g. a manual DevTools
  // test push, which sends a plain string) -- and it throws synchronously,
  // before waitUntil() runs, which would skip showNotification() entirely.
  // That's the exact silent-push pattern this handler must never produce,
  // so a parse failure falls back to an empty object instead of throwing.
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch {
    // Non-JSON payload -- fall through to the empty-object default below.
  }
  // D-13/CR-08: the coalescing tag is a TOP-LEVEL payload field written by
  // buildContentFreePayload (a conv-/probe-scoped routing key, never
  // message content). Previously this read data.data.conversationId, which
  // the payload has never carried -- so the tag was always undefined and
  // every unread reply stacked as its own notification. Falls back to no
  // tag when the field is absent or not a string (the non-JSON DevTools
  // push path above), and showNotification stays unconditional either way.
  const tag = typeof data.tag === "string" ? data.tag : undefined;
  event.waitUntil(
    // Fallback title/body only ever reached via a non-server test push (see
    // the try/catch above) -- the real server payload always sets both.
    self.registration.showNotification(data.title || "New message", {
      body: data.body || "",
      tag: tag,
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
