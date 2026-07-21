// TRANS-10: a small circuit breaker wrapping every translate.ts call site
// (Plan 02-05's cache.ts). State is pinned on globalThis exactly like
// realtime/hub.ts's subscriber registries (see hub.ts lines 17-28 for the
// full mechanism): Next's standalone build can bundle a module's graph
// twice, which would otherwise split a plain module-level object into two
// live instances -- one module graph recording failures while a different
// graph's isOpen() check never observes them, silently defeating the
// breaker. Pinning on globalThis makes every graph share one instance.

const FAILURE_THRESHOLD = 3; // consecutive failures before the breaker opens

// A translation outage is typically either momentary rate-limiting
// (recoverable within seconds to a minute) or a real provider outage that a
// minute's cooldown correctly avoids hammering with retries -- one minute
// balances both without leaving the breaker open needlessly long.
const COOLDOWN_MS = 60_000;

export { COOLDOWN_MS, FAILURE_THRESHOLD };

type BreakerState = { failures: number; openUntil: number };

const globalForBreaker = globalThis as unknown as {
  __onechatTranslationBreaker?: BreakerState;
};

const state: BreakerState =
  globalForBreaker.__onechatTranslationBreaker ??
  (globalForBreaker.__onechatTranslationBreaker = { failures: 0, openUntil: 0 });

/** True only while the breaker has tripped and its cooldown hasn't elapsed. */
export function isOpen(): boolean {
  return state.failures >= FAILURE_THRESHOLD && Date.now() < state.openUntil;
}

/**
 * Record a translation-call failure. Opens the breaker (sets openUntil)
 * exactly once, the moment the consecutive-failure count first reaches
 * FAILURE_THRESHOLD -- never one call early, never re-armed on every
 * failure after that.
 */
export function recordFailure(): void {
  state.failures += 1;
  if (state.failures === FAILURE_THRESHOLD) {
    state.openUntil = Date.now() + COOLDOWN_MS;
  }
}

/** Record a translation-call success. Resets and closes the breaker immediately. */
export function recordSuccess(): void {
  state.failures = 0;
  state.openUntil = 0;
}
