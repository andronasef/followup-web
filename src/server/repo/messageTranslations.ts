// Plan 02-05: message_translations repo layer -- the shared translation
// cache both the async visitor->owner path (translation/cache.ts's
// translateAndCache, called from chat/messages/route.ts's after()) and the
// owner's reply.ts same-transaction original-capture use. upsert() is a
// single ON CONFLICT DO NOTHING statement against Plan 02-01's unique index
// (message_translations_message_lang_idx on (message_id, target_lang)) --
// race-free, matches ratelimit.ts's single-statement discipline. TRANS-06:
// "at most once" -- a second upsert() call for an already-populated
// (messageId, targetLang) pair is a guaranteed no-op, never a second row or
// an overwrite of the first result.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/pool.ts";
import { messageTranslations } from "../db/schema.ts";

export type TranslationStatus = "ready" | "failed" | "pending";

export interface MessageTranslation {
  translatedText: string | null;
  status: string;
}

// Structural subset of `db` (also satisfied by a `db.transaction()`
// callback's `tx` argument) -- lets upsert() run either against the shared
// pool (default, the async visitor->owner path) or inside a caller-supplied
// transaction (reply.ts's Task 3 same-transaction original-capture case).
type DbExecutor = Pick<typeof db, "select" | "insert">;

export async function upsert(
  messageId: number,
  targetLang: string,
  translatedText: string | null,
  status: TranslationStatus,
  executor: DbExecutor = db,
): Promise<void> {
  await executor
    .insert(messageTranslations)
    .values({ messageId, targetLang, translatedText, status })
    .onConflictDoNothing({
      target: [messageTranslations.messageId, messageTranslations.targetLang],
    });
}

export async function get(messageId: number, targetLang: string): Promise<MessageTranslation | null> {
  const [row] = await db
    .select({ translatedText: messageTranslations.translatedText, status: messageTranslations.status })
    .from(messageTranslations)
    .where(and(eq(messageTranslations.messageId, messageId), eq(messageTranslations.targetLang, targetLang)))
    .limit(1);
  return row ?? null;
}

/**
 * Batch lookup for a single targetLang across many messageIds -- returns a
 * Map keyed by messageId (Plan 02-08's Thread.tsx server-side fetch). An
 * empty `messageIds` array short-circuits to an empty Map with zero query.
 */
export async function listForMessageIds(
  messageIds: number[],
  targetLang: string,
): Promise<Map<number, MessageTranslation>> {
  if (messageIds.length === 0) return new Map();

  const rows = await db
    .select({
      messageId: messageTranslations.messageId,
      translatedText: messageTranslations.translatedText,
      status: messageTranslations.status,
    })
    .from(messageTranslations)
    .where(and(inArray(messageTranslations.messageId, messageIds), eq(messageTranslations.targetLang, targetLang)));

  const result = new Map<number, MessageTranslation>();
  for (const row of rows) {
    result.set(row.messageId, { translatedText: row.translatedText, status: row.status });
  }
  return result;
}
