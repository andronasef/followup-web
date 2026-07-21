// CHAT-08: resolves "the" open conversation for a returning visitor. The
// partial unique index conversations_open_visitor_idx (WHERE status <>
// 'closed', see schema.ts) is the actual concurrency guard -- openFor is
// select-then-insert-if-missing, with ON CONFLICT DO NOTHING against that
// same index so concurrent requests from one visitor never create two open
// conversations; the loser of the race simply re-reads the winner's row.
import { and, eq, ne, sql as rawSql } from "drizzle-orm";
import { db } from "../db/pool.ts";
import { conversations } from "../db/schema.ts";
import type { MessageSender } from "./messages.ts";

export type Conversation = typeof conversations.$inferSelect;

const isOpen = (visitorId: string) =>
  and(eq(conversations.visitorId, visitorId), ne(conversations.status, "closed"));

export async function openFor(visitorId: string): Promise<Conversation> {
  const [existing] = await db.select().from(conversations).where(isOpen(visitorId)).limit(1);
  if (existing) return existing;

  const [inserted] = await db
    .insert(conversations)
    .values({ visitorId, status: "new" })
    .onConflictDoNothing({
      target: conversations.visitorId,
      // Matches the partial unique index's own predicate -- Postgres
      // requires the ON CONFLICT target's WHERE clause to match a partial
      // index's predicate exactly for it to be usable as an arbiter.
      where: rawSql`${conversations.status} <> 'closed'`,
    })
    .returning();
  if (inserted) return inserted;

  // Lost the race -- another concurrent call's insert won. Its row now
  // satisfies the same lookup.
  const [winner] = await db.select().from(conversations).where(isOpen(visitorId)).limit(1);
  if (!winner) {
    throw new Error(
      `conversations.openFor: no open conversation found for visitor ${visitorId} after a lost insert race`,
    );
  }
  return winner;
}

export interface ConversationPreview {
  id: number;
  lastMessageBody: string | null;
  lastMessageSender: MessageSender | null;
  lastMessageAt: Date;
}

/**
 * ADMIN-03/D-12: the flat, unsorted-beyond-recency conversation list for the
 * owner's admin dashboard -- a plain ORDER BY most-recent-message-time, never
 * a priority/faith-decision weighting (that first slice of ADMIN-05's real
 * inbox is Phase 3's, explicitly out of scope here). A LEFT JOIN LATERAL
 * pulls each conversation's single most recent message, if any -- a
 * conversation can briefly have zero persisted rows, since D-05's welcome is
 * rendered client-side and is never a `messages` row -- falling back to the
 * conversation's own createdAt so a brand-new, message-less conversation
 * still sorts and renders correctly.
 */
export async function listWithPreview(): Promise<ConversationPreview[]> {
  const rows = await db.execute<{
    id: number;
    last_message_body: string | null;
    last_message_sender: MessageSender | null;
    last_message_at: Date;
  }>(rawSql`
    select
      c.id as id,
      lm.body as last_message_body,
      lm.sender as last_message_sender,
      coalesce(lm.created_at, c.created_at) as last_message_at
    from conversations c
    left join lateral (
      select body, sender, created_at
      from messages
      where messages.conversation_id = c.id
      order by messages.id desc
      limit 1
    ) lm on true
    order by last_message_at desc
  `);

  return rows.map((row) => ({
    id: row.id,
    lastMessageBody: row.last_message_body,
    lastMessageSender: row.last_message_sender,
    lastMessageAt: row.last_message_at,
  }));
}

/**
 * Resolves the visitor's stored language for `conversationId` -- used by
 * Plan 02-05's translate-preview.ts to pick the owner's draft-preview
 * target language. Returns null if the conversation doesn't exist or the
 * visitor's `lang` column is null; the caller (not this function) should
 * treat a null return as "en", since assuming a hardcoded default here
 * would hide a genuinely-missing lang value from a caller that might want
 * to handle it differently.
 */
export async function getVisitorLangFor(conversationId: number): Promise<string | null> {
  const rows = await db.execute<{ lang: string | null }>(rawSql`
    select v.lang as lang
    from conversations c
    join visitors v on v.id = c.visitor_id
    where c.id = ${conversationId}
  `);
  const [row] = rows;
  return row?.lang ?? null;
}
