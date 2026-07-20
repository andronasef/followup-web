import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "../db/pool.ts";
import { getOrCreate as getOrCreateVisitor } from "./visitors.ts";
import { openFor } from "./conversations.ts";
import { create, since } from "./messages.ts";

async function makeConversation() {
  const visitor = await getOrCreateVisitor();
  const conversation = await openFor(visitor.id);
  return { visitor, conversation };
}

async function cleanup(conversationId: number, visitorId: string) {
  await sql`delete from messages where conversation_id = ${conversationId}`;
  await sql`delete from conversations where id = ${conversationId}`;
  await sql`delete from visitors where id = ${visitorId}`;
}

test("messages.since: returns exactly N rows in ascending id order", async () => {
  const { visitor, conversation } = await makeConversation();
  try {
    const bodies = ["first", "second", "third"];
    for (const body of bodies) {
      await create(conversation.id, "visitor", body);
    }

    const rows = await since(conversation.id, 0);
    assert.equal(rows.length, bodies.length, "must return exactly N rows");

    const ids = rows.map((r) => r.id);
    const sortedIds = [...ids].sort((a, b) => a - b);
    assert.deepEqual(ids, sortedIds, "rows must be in ascending id order");
    assert.deepEqual(
      rows.map((r) => r.body),
      bodies,
      "row order must match insertion order",
    );
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("messages.create: idempotent on (conversation_id, client_msg_id) — a retried send is a no-op", async () => {
  const { visitor, conversation } = await makeConversation();
  try {
    const clientMsgId = "retry-1";
    const first = await create(conversation.id, "visitor", "hello", clientMsgId);
    const second = await create(conversation.id, "visitor", "hello (retried)", clientMsgId);

    assert.equal(first.id, second.id, "the retried call must return the original row's id");

    const rows = await since(conversation.id, 0);
    assert.equal(rows.length, 1, "the retried call must not insert a second row");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});
