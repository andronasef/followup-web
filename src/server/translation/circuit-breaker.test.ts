import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { COOLDOWN_MS, FAILURE_THRESHOLD, isOpen, recordFailure, recordSuccess } from "./circuit-breaker.ts";

// The breaker's state is a globalThis-pinned singleton (by design -- see
// circuit-breaker.ts's header comment); reset it between tests so each test
// starts from a closed breaker regardless of run order.
beforeEach(() => {
  recordSuccess();
});

test("circuit-breaker: isOpen is false initially (no failures recorded yet)", () => {
  assert.equal(isOpen(), false);
});

test(`circuit-breaker: isOpen becomes true after exactly ${FAILURE_THRESHOLD} consecutive failures`, () => {
  for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
    recordFailure();
    assert.equal(isOpen(), false, "must not open before the threshold is reached");
  }
  recordFailure();
  assert.equal(isOpen(), true, "must open exactly at the threshold-th failure");
});

test("circuit-breaker: one isolated failure below threshold does not open the breaker", () => {
  recordFailure();
  assert.equal(isOpen(), false);
});

test("circuit-breaker: stays open until COOLDOWN_MS has elapsed since the threshold-crossing failure", (t) => {
  let now = 1_700_000_000_000;
  t.mock.method(Date, "now", () => now);

  for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure();
  assert.equal(isOpen(), true, "breaker must be open immediately after crossing the threshold");

  now += COOLDOWN_MS - 1;
  assert.equal(isOpen(), true, "breaker must still be open just before the cooldown elapses");

  now += 2;
  assert.equal(isOpen(), false, "breaker must close once the cooldown has fully elapsed");
});

test("circuit-breaker: recordSuccess resets the consecutive-failure count and closes the breaker immediately", () => {
  for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure();
  assert.equal(isOpen(), true);

  recordSuccess();
  assert.equal(isOpen(), false);

  // A fresh run of below-threshold failures after a reset must not reopen it.
  recordFailure();
  assert.equal(isOpen(), false);
});
