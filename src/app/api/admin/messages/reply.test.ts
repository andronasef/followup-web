import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "../../../../server/db/pool.ts";
import { getOrCreate as getOrCreateVisitor } from "../../../../server/repo/visitors.ts";
import { openFor } from "../../../../server/repo/conversations.ts";
import { handleAdminReply } from "./reply.ts";

// node:test runs each file in its own process; without closing the pool the
// process never exits and the whole `node --test` run hangs.
after(async () => {
  await sql.end({ timeout: 5 });
});

async function freshConversation() {
  const visitor = await getOrCreateVisitor();
  const conversation = await openFor(visitor.id);
  return { visitor, conversation };
}

async function cleanup(conversationId: number, visitorId: string) {
  await sql`delete from messages where conversation_id = ${conversationId}`;
  await sql`delete from conversations where id = ${conversationId}`;
  await sql`delete from visitors where id = ${visitorId}`;
}

test("handleAdminReply: without a valid owner session (ownerId: null) returns 401 and persists nothing", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const result = await handleAdminReply({
      ownerId: null,
      rawBody: { conversationId: conversation.id, body: "an owner reply" },
    });

    assert.equal(result.status, 401);

    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count from messages where conversation_id = ${conversation.id}
    `;
    assert.equal(rows[0]!.count, 0, "an unauthenticated reply must never be persisted");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("handleAdminReply: with a valid ownerId persists an owner-sender row via the same durability pattern", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const result = await handleAdminReply({
      ownerId: "1",
      rawBody: { conversationId: conversation.id, body: "we're praying for you" },
    });

    assert.equal(result.status, 200);
    assert.ok("id" in result.body);

    const rows = await sql<{ sender: string }[]>`
      select sender from messages where conversation_id = ${conversation.id}
    `;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.sender, "owner");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});
