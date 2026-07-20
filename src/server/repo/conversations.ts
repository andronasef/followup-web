// CHAT-08: resolves "the" open conversation for a returning visitor. The
// partial unique index conversations_open_visitor_idx (WHERE status <>
// 'closed', see schema.ts) is the actual concurrency guard -- openFor is
// select-then-insert-if-missing, with ON CONFLICT DO NOTHING against that
// same index so concurrent requests from one visitor never create two open
// conversations; the loser of the race simply re-reads the winner's row.
import { and, eq, ne, sql as rawSql } from "drizzle-orm";
import { db } from "../db/pool.ts";
import { conversations } from "../db/schema.ts";

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
