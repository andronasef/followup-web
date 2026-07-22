import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sendGateEventBeacon,
  subscribeToPush,
  syncSubscriptionOnOpen,
  urlBase64ToUint8Array,
} from "./subscribe-client.ts";

/** Overrides globalThis.navigator for the duration of one test -- Node's
 * built-in `navigator` global is a non-writable getter, so a plain
 * assignment silently no-ops; `Object.defineProperty` with
 * `configurable:true` is required to override it per-test. */
function mockNavigator(value: Record<string, unknown>) {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
}

function mockFetch(impl: (...args: unknown[]) => Promise<unknown>) {
  (globalThis as unknown as { fetch: unknown }).fetch = impl;
}

const MOCK_ENDPOINT = "https://push.example.com/abc";

test("urlBase64ToUint8Array: converts a URL-safe base64 VAPID key into a Uint8Array", () => {
  // "test" base64-encoded is "dGVzdA==" -- URL-safe form strips padding.
  const result = urlBase64ToUint8Array("dGVzdA");
  assert.ok(result instanceof Uint8Array);
  assert.deepEqual(Array.from(result), [116, 101, 115, 116]); // "test"
});

test("subscribeToPush: calls serviceWorker.ready then pushManager.subscribe(), POSTs to /api/push/subscribe, returns {probeOk}", async () => {
  let capturedUrl: string | undefined;
  let capturedBody: unknown;
  mockNavigator({
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          // `this.endpoint` here does not typecheck: inside an object
          // literal returned from an async arrow, TS types `this` as the
          // awaited-or-thenable union, so the property lookup fails
          // (TS2339) and the self-referential toJSON return is `any`
          // (TS7023). The endpoint is a fixed test constant anyway.
          subscribe: async (_opts: unknown) => ({
            endpoint: MOCK_ENDPOINT,
            toJSON: () => ({ endpoint: MOCK_ENDPOINT }),
          }),
        },
      }),
    },
    userAgent: "test-agent",
  });
  mockFetch(async (url: unknown, init: unknown) => {
    capturedUrl = url as string;
    capturedBody = JSON.parse((init as { body: string }).body);
    return { ok: true, json: async () => ({ probeOk: true }) };
  });

  const result = await subscribeToPush("dGVzdA");

  assert.equal(capturedUrl, "/api/push/subscribe");
  assert.ok(capturedBody);
  assert.equal((capturedBody as { platform: string }).platform, "other");
  assert.deepEqual(result, { outcome: "ok", probeOk: true });
});

test("subscribeToPush: CR-01 a 409 resolves to the conflict outcome", async () => {
  mockNavigator({
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          subscribe: async () => ({ endpoint: "https://push.example.com/abc" }),
        },
      }),
    },
    userAgent: "test-agent",
  });
  mockFetch(async () => ({ ok: false, status: 409, json: async () => ({}) }));

  const result = await subscribeToPush("dGVzdA");
  assert.deepEqual(result, { outcome: "conflict", probeOk: false });
});

test("subscribeToPush: resolves to the failed outcome (never throws) when pushManager.subscribe() rejects", async () => {
  mockNavigator({
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          subscribe: async () => {
            throw new Error("permission not actually granted");
          },
        },
      }),
    },
    userAgent: "test-agent",
  });

  const result = await subscribeToPush("dGVzdA");
  assert.deepEqual(result, { outcome: "failed", probeOk: false });
});

test("syncSubscriptionOnOpen: is a no-op (no fetch call) when getSubscription() resolves null", async () => {
  let fetchCalled = false;
  mockNavigator({
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: { getSubscription: async () => null },
      }),
    },
    userAgent: "test-agent",
  });
  mockFetch(async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({}) };
  });

  const outcome = await syncSubscriptionOnOpen("https://push.example.com/old");
  assert.equal(fetchCalled, false);
  assert.equal(outcome, "skipped", "no subscription at all resolves to the skipped outcome");
});

test("syncSubscriptionOnOpen: is a no-op when the current subscription's endpoint equals lastKnownEndpoint", async () => {
  let fetchCalled = false;
  mockNavigator({
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => ({ endpoint: "https://push.example.com/same" }),
        },
      }),
    },
    userAgent: "test-agent",
  });
  mockFetch(async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({}) };
  });

  await syncSubscriptionOnOpen("https://push.example.com/same");
  assert.equal(fetchCalled, false);
});

test("syncSubscriptionOnOpen: re-POSTs to /api/push/subscribe exactly once when the current endpoint differs from lastKnownEndpoint", async () => {
  let callCount = 0;
  let capturedUrl: string | undefined;
  mockNavigator({
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => ({ endpoint: "https://push.example.com/new" }),
        },
      }),
    },
    userAgent: "test-agent",
  });
  mockFetch(async (url: unknown) => {
    callCount++;
    capturedUrl = url as string;
    return { ok: true, json: async () => ({}) };
  });

  const outcome = await syncSubscriptionOnOpen("https://push.example.com/old");
  assert.equal(callCount, 1);
  assert.equal(capturedUrl, "/api/push/subscribe");
  assert.equal(outcome, "ok", "a 2xx re-sync resolves to the ok outcome");
});

test("syncSubscriptionOnOpen: CR-01 a 409 resolves to the conflict outcome so the caller can run ID-03 recovery", async () => {
  mockNavigator({
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => ({ endpoint: "https://push.example.com/new" }),
        },
      }),
    },
    userAgent: "test-agent",
  });
  mockFetch(async () => ({ ok: false, status: 409, json: async () => ({}) }));

  assert.equal(await syncSubscriptionOnOpen("https://push.example.com/old"), "conflict");
});

test("syncSubscriptionOnOpen: a thrown error resolves to the failed outcome and never rejects", async () => {
  mockNavigator({
    serviceWorker: {
      get ready() {
        return Promise.reject(new Error("no service worker"));
      },
    },
    userAgent: "test-agent",
  });

  assert.equal(await syncSubscriptionOnOpen(null), "failed");
});

test("sendGateEventBeacon: calls navigator.sendBeacon with the correct URL and a JSON body containing {kind, platform}", async () => {
  let capturedUrl: string | undefined;
  let capturedBody: Blob | undefined;
  mockNavigator({
    sendBeacon: (url: string, body: Blob) => {
      capturedUrl = url;
      capturedBody = body;
      return true;
    },
    userAgent: "test-agent",
  });

  sendGateEventBeacon("shown", "ios");

  assert.equal(capturedUrl, "/api/push/gate-event");
  assert.ok(capturedBody instanceof Blob);
  const parsed = JSON.parse(await capturedBody!.text());
  assert.deepEqual(parsed, { kind: "shown", platform: "ios" });
});
