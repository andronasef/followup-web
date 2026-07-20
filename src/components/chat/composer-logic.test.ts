// RED: behavior tests for Composer.tsx's D-18/D-19/D-20 state machine.
// Composer.tsx itself is a .tsx file with JSX -- plain
// `node --experimental-strip-types --test` performs TypeScript type
// stripping only, not a JSX transform, so it cannot execute a .tsx file
// directly (see 01-08-SUMMARY.md's send.ts/reply.ts split for the same
// class of test-runnability constraint, there caused by a next/headers
// import rather than JSX). The state machine is therefore extracted into
// this framework-free module (composer-logic.ts) so it is directly
// node:test-able; Composer.tsx wires it to React state/DOM/fetch.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMPOSER_MAX_RETRIES,
  createOptimisticBubble,
  guardSubmit,
  sendWithRetry,
} from "./composer-logic.ts";

test("guardSubmit: an empty or whitespace-only value is a no-op -- returns null, never a body to send", () => {
  assert.equal(guardSubmit(""), null);
  assert.equal(guardSubmit("   \n\t  "), null);
});

test("guardSubmit: a non-empty value returns the trimmed body to send", () => {
  assert.equal(guardSubmit("  hello there  "), "hello there");
});

test("createOptimisticBubble: synchronously returns a 'sending' bubble carrying the exact typed text -- before any network call could resolve (D-18)", () => {
  const bubble = createOptimisticBubble("something hard to say", "cid-1");
  assert.equal(bubble.state, "sending");
  assert.equal(bubble.body, "something hard to say");
  assert.equal(bubble.clientMsgId, "cid-1");
});

test("sendWithRetry: a successful first attempt resolves true and calls post exactly once", async () => {
  let calls = 0;
  const ok = await sendWithRetry(
    async () => {
      calls++;
      return true;
    },
    { delay: async () => {} },
  );
  assert.equal(ok, true);
  assert.equal(calls, 1);
});

test("sendWithRetry: retries automatically and silently on failure before succeeding (D-19) -- the caller's typed text is never a parameter this function can clear", async () => {
  let calls = 0;
  const ok = await sendWithRetry(
    async () => {
      calls++;
      return calls >= 3; // fails twice, succeeds on the 3rd attempt
    },
    { delay: async () => {} },
  );
  assert.equal(ok, true);
  assert.equal(calls, 3, "should retry automatically without the caller intervening");
});

test("sendWithRetry: gives up only after a fixed, bounded number of retries -- never unbounded (T-01-31)", async () => {
  let calls = 0;
  const ok = await sendWithRetry(
    async () => {
      calls++;
      return false;
    },
    { maxRetries: 2, delay: async () => {} },
  );
  assert.equal(ok, false);
  assert.equal(calls, 3, "1 initial attempt + 2 retries, then stop -- a bounded loop");
});

test("sendWithRetry: a manual tap-to-retry reuses the identical clientMsgId as the original attempt -- never regenerated", async () => {
  const bubble = createOptimisticBubble("something hard to say", "cid-fixed");
  const seenIds: string[] = [];

  async function post(clientMsgId: string) {
    seenIds.push(clientMsgId);
    return false;
  }

  await sendWithRetry(() => post(bubble.clientMsgId), { maxRetries: 1, delay: async () => {} });
  // Simulate the visitor tapping "tap to retry" after the failed state --
  // same bubble, same id, so the server-side idempotency key never changes.
  await sendWithRetry(() => post(bubble.clientMsgId), { maxRetries: 0, delay: async () => {} });

  assert.ok(
    seenIds.length > 0 && seenIds.every((id) => id === "cid-fixed"),
    "clientMsgId must never change across retries or a manual tap-to-retry",
  );
});

test("COMPOSER_MAX_RETRIES is a small, fixed number -- a bounded retry loop, not an unbounded one", () => {
  assert.ok(COMPOSER_MAX_RETRIES > 0 && COMPOSER_MAX_RETRIES <= 5);
});
