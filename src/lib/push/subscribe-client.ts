// PUSH-11/D-15/D-16: client-side subscribe/re-sync/beacon helpers Plan
// 02-07's Gate.tsx wires directly. No server-side dependency -- directly
// node:test-runnable with global (`navigator`/`fetch`) mocks, unlike
// server/push/subscribe.ts's next/headers-free-but-DB-backed split.
//
// No "use client" directive -- like composer-logic.ts, this is a pure
// browser-API utility module (no JSX, no React import), not itself a
// component; a client component importing it (Plan 02-07's Gate.tsx)
// already puts it in the client bundle without needing its own marker.

/**
 * Standard VAPID-key-to-Uint8Array conversion --
 * `pushManager.subscribe()`'s `applicationServerKey` requires a
 * `Uint8Array`, not the raw URL-safe base64 string
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is stored as.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64Safe);
  // Explicit ArrayBuffer generic -- `applicationServerKey` requires
  // `BufferSource` (`ArrayBufferView<ArrayBuffer>`), which a bare
  // `Uint8Array` return type no longer satisfies under recent TS DOM lib
  // typings (its default generic widened to `ArrayBufferLike`, which also
  // covers `SharedArrayBuffer`).
  const outputArray: Uint8Array<ArrayBuffer> = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * iOS/iPadOS detection: the direct UA match covers iPhone/iPod/older
 * iPad; the touch-points+MacIntel check covers iPadOS's desktop-mode UA
 * (which reports as a Mac). Defensive against a missing `window`/
 * `navigator` (SSR, or a bare node:test environment) -- returns "other"
 * rather than throwing.
 */
export function detectPlatform(): "ios" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent ?? "";
  const notMsStream = !(typeof window !== "undefined" && "MSStream" in window);
  const isIPhoneFamily = /iPad|iPhone|iPod/.test(ua) && notMsStream;
  const isIPadOSDesktopMode =
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1 &&
    /MacIntel/.test(navigator.platform ?? "");
  return isIPhoneFamily || isIPadOSDesktopMode ? "ios" : "other";
}

/**
 * CR-01: what the server said about this device's identity binding.
 *  - "ok"       the subscription is bound to the calling visitor.
 *  - "conflict" HTTP 409 -- the endpoint is already owned by a DIFFERENT
 *               visitor (the binding is set-once server-side). The caller's
 *               correct response is to run the ID-03 endpoint recovery, not
 *               to retry the subscribe.
 *  - "skipped"  there is no push subscription on this device at all.
 *  - "failed"   any other non-2xx, or a thrown browser/network error.
 */
export type SubscribeOutcome = "ok" | "conflict" | "skipped" | "failed";

/**
 * PUSH-12: subscribes and POSTs to /api/push/subscribe, returning the
 * server's `{probeOk}` response alongside the CR-01 identity `outcome`.
 * Never throws -- any failure (permission not actually granted,
 * `pushManager.subscribe()` rejecting, a network error) resolves to the
 * "failed" outcome so the gate UI's caller can treat every branch
 * uniformly.
 */
export async function subscribeToPush(publicKey: string): Promise<{ outcome: SubscribeOutcome; probeOk: boolean }> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription, platform: detectPlatform() }),
    });
    if (response.status === 409) return { outcome: "conflict", probeOk: false };
    if (!response.ok) return { outcome: "failed", probeOk: false };
    const body = (await response.json()) as { probeOk?: boolean };
    return { outcome: "ok", probeOk: body.probeOk === true };
  } catch {
    return { outcome: "failed", probeOk: false };
  }
}

/**
 * PUSH-11: called on every app open (Chrome never fires
 * `pushsubscriptionchange` -- RESEARCH.md Pitfall 3). Silent on every
 * branch per D-15/D-16 -- no throw, no visitor-facing surface, only a
 * debug-level log.
 *
 * CR-01: resolves to a `SubscribeOutcome` rather than void, so a "conflict"
 * (this device already belongs to another visitor id) can drive the
 * caller's ID-03 recovery instead of being swallowed here.
 */
export async function syncSubscriptionOnOpen(lastKnownEndpoint: string | null): Promise<SubscribeOutcome> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      // Never granted, or the gate hasn't been reached yet on this device.
      return "skipped";
    }
    if (subscription.endpoint === lastKnownEndpoint) {
      // Unchanged -- nothing to re-sync, and nothing the server could tell
      // us that it didn't already tell us last time.
      return "ok";
    }

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription, platform: detectPlatform() }),
    });
    if (response.status === 409) return "conflict";
    return response.ok ? "ok" : "failed";
  } catch (error) {
    console.debug("[push] syncSubscriptionOnOpen failed silently", error);
    return "failed";
  }
}

/**
 * OPS-11: fire-and-forget gate-funnel instrumentation. Uses
 * `navigator.sendBeacon` (not `fetch`) specifically because this call must
 * survive a page unload (e.g. the visitor closes the tab the instant the
 * gate is shown) -- matches pre-paint.ts's bootstrap fetch's
 * fire-and-forget style, but via the beacon API for that survival
 * guarantee.
 */
export function sendGateEventBeacon(kind: "shown" | "prompt_reached", platform: "ios" | "other"): void {
  try {
    navigator.sendBeacon(
      "/api/push/gate-event",
      new Blob([JSON.stringify({ kind, platform })], { type: "application/json" }),
    );
  } catch {
    // Best-effort only.
  }
}
