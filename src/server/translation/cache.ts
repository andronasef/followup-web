// Plan 02-05: the shared validated-translate-and-persist layer. Used by the
// async visitor->owner trigger (chat/messages/route.ts's after() call,
// TRANS-01) -- translate-preview.ts (Task 3, the owner's synchronous
// pre-send draft preview) deliberately calls translate.translate()
// directly instead, since a preview has no messageId yet to key a cache row
// on (see translate-preview.ts's own header).
//
// Every successful translate() result is validated against all four
// TRANS-07 checks before ever being marked "ready" -- a failing validator is
// treated identically to a hard translate() failure: status='failed',
// circuit-breaker.recordFailure(), and every reader falls back to the
// original messages.body (never an empty bubble).
import { upsert, type TranslationStatus } from "../repo/messageTranslations.ts";
import { db } from "../db/pool.ts";
import * as circuitBreaker from "./circuit-breaker.ts";
import { hasRefusalMarker, lengthRatioOk, preservesTokens, scriptBlockMatch, translate } from "./translate.ts";

// Same DbExecutor shape as messageTranslations.ts's upsert -- lets a caller
// (reply.ts's Task 3) run this inside its own db.transaction when it
// eventually needs a validated translate-and-persist call in that shape.
// Plan 02-05's own Task 3 does NOT use this parameter (it persists an
// already-computed originalBody directly via messageTranslations.upsert),
// but the seam is kept here since cache.ts is the one module that owns the
// validated-translate-and-persist logic end to end.
type DbExecutor = Pick<typeof db, "select" | "insert">;

export async function translateAndCache(
  messageId: number,
  sourceText: string,
  sourceLang: string,
  targetLang: string,
  executor?: DbExecutor,
): Promise<void> {
  // TRANS-06: an explicit skip when source already equals target -- no
  // translate() call, no row written, not even a "skipped" marker row.
  if (sourceLang === targetLang) return;

  // TRANS-10: an open circuit breaker skips the call entirely -- no cost
  // incurred against an already-failing provider, no row written.
  if (circuitBreaker.isOpen()) return;

  const result = await translate(sourceText, sourceLang, targetLang);

  if (!result.ok) {
    circuitBreaker.recordFailure();
    await upsert(messageId, targetLang, null, "failed" as TranslationStatus, executor);
    return;
  }

  const valid =
    scriptBlockMatch(result.text, targetLang) &&
    lengthRatioOk(sourceText, result.text) &&
    !hasRefusalMarker(result.text) &&
    preservesTokens(sourceText, result.text);

  if (!valid) {
    circuitBreaker.recordFailure();
    await upsert(messageId, targetLang, null, "failed" as TranslationStatus, executor);
    return;
  }

  circuitBreaker.recordSuccess();
  await upsert(messageId, targetLang, result.text, "ready" as TranslationStatus, executor);
}
