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
  /**
   * OPS-11/D-18: true only for a visitor who was once granted push
   * (`push_gate_funnel.granted_at is not null`) and now has ZERO live
   * `push_subscriptions` rows -- distinct from "never granted push at all",
   * which is NOT unreachable, just never-subscribed (RESEARCH.md
   * Architecture Pattern 5).
   */
  unreachable: boolean;
}

/**
 * ADMIN-03/D-12: the flat, unsorted-beyond-recency conversation list for the
 * owner's admin dashboard -- a plain ORDER BY most-recent-message-time, never
 * a priority/faith-decision weighting (that first slice of ADMIN-05's real
 * inbox is Phase 3's, explicitly out of scope here). An INNER JOIN LATERAL
 * pulls each conversation's single most recent message -- a conversation
 * row exists as soon as a visitor is recognized (openFor() runs on every
 * requireVisitor() call, before D-05's client-side-only welcome and before
 * any message is ever sent), so an unfiltered list would surface every
 * visitor who merely opened the URL and never wrote anything. The page's
 * own locked empty-state copy ("When someone opens the chat and sends a
 * message, it will appear here") is the spec for this: only conversations
 * that have sent at least one message belong in the owner's inbox.
 */
export async function listWithPreview(): Promise<ConversationPreview[]> {
  const rows = await db.execute<{
    id: number;
    last_message_body: string | null;
    last_message_sender: MessageSender | null;
    last_message_at: Date;
    unreachable: boolean;
  }>(rawSql`
    select
      c.id as id,
      lm.body as last_message_body,
      lm.sender as last_message_sender,
      lm.created_at as last_message_at,
      (
        gf.granted_at is not null
        and not exists (
          select 1 from push_subscriptions ps where ps.visitor_id = c.visitor_id
        )
      ) as unreachable
    from conversations c
    inner join lateral (
      select body, sender, created_at
      from messages
      where messages.conversation_id = c.id
      order by messages.id desc
      limit 1
    ) lm on true
    left join push_gate_funnel gf on gf.visitor_id = c.visitor_id
    order by last_message_at desc
  `);

  return rows.map((row) => ({
    id: row.id,
    lastMessageBody: row.last_message_body,
    lastMessageSender: row.last_message_sender,
    lastMessageAt: row.last_message_at,
    unreachable: row.unreachable,
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

export interface VisitorAndLang {
  visitorId: string;
  lang: string | null;
}

/**
 * Plan 02-06: resolves BOTH the visitor id and stored lang for
 * `conversationId` in one query -- the admin reply route's push trigger
 * (sendPushToVisitor's visitorId/lang params) needs both, and this is the
 * single lookup reply.ts's handleAdminReply performs up front so route.ts
 * never has to issue a second query of its own. Returns null when
 * `conversationId` doesn't exist -- the caller should treat this as a
 * 400, not attempt the message insert against a foreign key that will
 * fail anyway.
 */
export async function getVisitorAndLangFor(conversationId: number): Promise<VisitorAndLang | null> {
  const rows = await db.execute<{ visitor_id: string; lang: string | null }>(rawSql`
    select v.id as visitor_id, v.lang as lang
    from conversations c
    join visitors v on v.id = c.visitor_id
    where c.id = ${conversationId}
  `);
  const [row] = rows;
  if (!row) return null;
  return { visitorId: row.visitor_id, lang: row.lang };
}
