import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "../db/pool.ts";
import { getOrCreate as getOrCreateVisitor } from "./visitors.ts";
import { openFor } from "./conversations.ts";
import { belongsToConversation, create, markDelivered, since } from "./messages.ts";

// node:test runs each file in its own process; without closing the pool the
// process never exits (open sockets keep the event loop alive) and the
// whole `node --test` run hangs waiting on this file's child process.
after(async () => {
  await sql.end({ timeout: 5 });
});

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

test("messages.markDelivered: sets deliveredAt on a message that hasn't been acked yet", async () => {
  const { visitor, conversation } = await makeConversation();
  try {
    const message = await create(conversation.id, "owner", "reply");
    assert.equal(message.deliveredAt, null, "deliveredAt must start null");

    await markDelivered(message.id);

    const [row] = await since(conversation.id, 0);
    assert.ok(row.deliveredAt, "deliveredAt must be set after markDelivered");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("messages.markDelivered: a repeat call is a no-op, never moves an already-set deliveredAt", async () => {
  const { visitor, conversation } = await makeConversation();
  try {
    const message = await create(conversation.id, "owner", "reply");
    await markDelivered(message.id);
    const [first] = await since(conversation.id, 0);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await markDelivered(message.id);
    const [second] = await since(conversation.id, 0);

    assert.equal(
      second.deliveredAt?.getTime(),
      first.deliveredAt?.getTime(),
      "a repeated markDelivered call must never move an already-set deliveredAt",
    );
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("messages.belongsToConversation: true for a message inside the given conversation", async () => {
  const { visitor, conversation } = await makeConversation();
  try {
    const message = await create(conversation.id, "visitor", "hi");
    const result = await belongsToConversation(message.id, conversation.id);
    assert.equal(result, true);
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("messages.belongsToConversation: false for a message that belongs to a different conversation", async () => {
  const first = await makeConversation();
  const second = await makeConversation();
  try {
    const message = await create(first.conversation.id, "visitor", "hi");
    const result = await belongsToConversation(message.id, second.conversation.id);
    assert.equal(result, false);
  } finally {
    await cleanup(first.conversation.id, first.visitor.id);
    await cleanup(second.conversation.id, second.visitor.id);
  }
});

test("messages.belongsToConversation: false for a nonexistent message id", async () => {
  const { visitor, conversation } = await makeConversation();
  try {
    const result = await belongsToConversation(-1, conversation.id);
    assert.equal(result, false);
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});
