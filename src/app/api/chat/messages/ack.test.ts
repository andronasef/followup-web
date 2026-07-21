import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "../../../../server/db/pool.ts";
import { getOrCreate as getOrCreateVisitor } from "../../../../server/repo/visitors.ts";
import { openFor } from "../../../../server/repo/conversations.ts";
import { create as createMessage, getDeliveredAt } from "../../../../server/repo/messages.ts";
import { handleAck } from "./ack.ts";

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

test("handleAck: marks a message delivered when it belongs to the caller's own conversationId", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const message = await createMessage(conversation.id, "owner", "hello, we're here for you");

    const result = await handleAck({ conversationId: conversation.id, rawBody: { messageId: message.id } });

    assert.equal(result.status, 200);
    const deliveredAt = await getDeliveredAt(message.id);
    assert.ok(deliveredAt, "delivered_at must be set once the caller's own message is acked");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("handleAck: returns 400 without writing when messageId belongs to a DIFFERENT conversation (T-02-19)", async () => {
  const { visitor: visitorA, conversation: conversationA } = await freshConversation();
  const { visitor: visitorB, conversation: conversationB } = await freshConversation();
  try {
    const messageInA = await createMessage(conversationA.id, "owner", "a message in conversation A");

    const result = await handleAck({ conversationId: conversationB.id, rawBody: { messageId: messageInA.id } });

    assert.equal(result.status, 400);
    const deliveredAt = await getDeliveredAt(messageInA.id);
    assert.equal(deliveredAt, null, "delivered_at must remain null when the ownership check fails");
  } finally {
    await cleanup(conversationA.id, visitorA.id);
    await cleanup(conversationB.id, visitorB.id);
  }
});

test("handleAck: is idempotent -- a repeated ack for an already-delivered message stays 200", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const message = await createMessage(conversation.id, "owner", "hello again");

    const first = await handleAck({ conversationId: conversation.id, rawBody: { messageId: message.id } });
    const firstDeliveredAt = await getDeliveredAt(message.id);
    const second = await handleAck({ conversationId: conversation.id, rawBody: { messageId: message.id } });
    const secondDeliveredAt = await getDeliveredAt(message.id);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(
      secondDeliveredAt?.getTime(),
      firstDeliveredAt?.getTime(),
      "a repeated ack must never overwrite the original delivered_at timestamp",
    );
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("handleAck: rejects a malformed body (missing or non-numeric messageId) with 400, no DB write", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const missing = await handleAck({ conversationId: conversation.id, rawBody: {} });
    const wrongType = await handleAck({ conversationId: conversation.id, rawBody: { messageId: "not-a-number" } });

    assert.equal(missing.status, 400);
    assert.equal(wrongType.status, 400);
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});
