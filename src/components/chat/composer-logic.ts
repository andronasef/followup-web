// Pure, framework-free state-transition logic behind Composer.tsx's
// optimistic-send/auto-retry/failed-tap-to-retry contract (D-18/D-19/D-20).
// Split out so it is directly node:test-able -- Composer.tsx is a .tsx file
// with JSX, which plain `node --experimental-strip-types --test` cannot
// execute (type stripping is not a JSX transform). See
// 01-08-SUMMARY.md's send.ts/reply.ts split for the same class of
// test-runnability constraint applied here to JSX rather than next/headers.

// T-01-31 (DoS, low): fixed and small -- a bounded retry loop, never
// unbounded, so a persistent failure cannot spin indefinitely against the
// send endpoint.
export const COMPOSER_MAX_RETRIES = 3;
export const COMPOSER_RETRY_DELAY_MS = 400;

/** CHAT-03: an empty/whitespace-only value is a no-op -- returns null, so the caller never calls the send API and never creates an optimistic bubble. */
export function guardSubmit(rawText: string): string | null {
  const trimmed = rawText.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type BubbleState = "sending" | "sent" | "failed";

export interface OptimisticBubble {
  clientMsgId: string;
  body: string;
  state: BubbleState;
}

/**
 * D-18: the bubble that appears the instant the visitor taps send, before
 * any network call resolves -- synchronous, so the caller can render it
 * immediately at 60% opacity ahead of the await below.
 */
export function createOptimisticBubble(body: string, clientMsgId: string): OptimisticBubble {
  return { clientMsgId, body, state: "sending" };
}

export interface RetryOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  /** Injectable so tests run instantly instead of waiting on real timers. */
  delay?: (ms: number) => Promise<void>;
}

/**
 * D-19: quietly retries a bounded number of times before giving up -- the
 * caller surfaces the failed state and tap-to-retry only once this
 * resolves false. This function never receives or returns the composer's
 * typed text, so it has no way to clear it; the caller (Composer.tsx) is
 * solely responsible for keeping the same clientMsgId/body across every
 * attempt, including a manual tap-to-retry.
 */
export async function sendWithRetry(post: () => Promise<boolean>, options: RetryOptions = {}): Promise<boolean> {
  const maxRetries = options.maxRetries ?? COMPOSER_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? COMPOSER_RETRY_DELAY_MS;
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (await post()) return true;
    if (attempt < maxRetries) await delay(retryDelayMs);
  }
  return false;
}
