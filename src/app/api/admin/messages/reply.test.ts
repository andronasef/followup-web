import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "../../../../server/db/pool.ts";
import { OWNER_LANG } from "../../../../server/config/models.ts";
import { getOrCreate as getOrCreateVisitor } from "../../../../server/repo/visitors.ts";
import { openFor } from "../../../../server/repo/conversations.ts";
import { get as getTranslation } from "../../../../server/repo/messageTranslations.ts";
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
  await sql`delete from message_translations where message_id in (select id from messages where conversation_id = ${conversationId})`;
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

test("handleAdminReply: a 200 result's body includes conversationId/visitorId/visitorLang alongside id/createdAt (PUSH-06/08's push trigger needs all three)", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const result = await handleAdminReply({
      ownerId: "1",
      rawBody: { conversationId: conversation.id, body: "we're praying for you" },
    });

    assert.equal(result.status, 200);
    const body = result.body as {
      conversationId: number;
      visitorId: string;
      visitorLang: string;
    };
    assert.equal(body.conversationId, conversation.id);
    assert.equal(body.visitorId, visitor.id);
    assert.equal(typeof body.visitorLang, "string");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("handleAdminReply: a conversationId that does not exist returns 400 (never an unhandled foreign-key error)", async () => {
  const result = await handleAdminReply({
    ownerId: "1",
    rawBody: { conversationId: 999_999_999, body: "we're praying for you" },
  });

  assert.equal(result.status, 400);
});

test("handleAdminReply: a non-empty originalBody that differs from body persists a message_translations(messageId, OWNER_LANG) row in the same transaction", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const result = await handleAdminReply({
      ownerId: "1",
      rawBody: {
        conversationId: conversation.id,
        body: "estamos orando por ti",
        originalBody: "we're praying for you",
      },
    });

    assert.equal(result.status, 200);
    const messageId = (result.body as { id: number }).id;

    const translation = await getTranslation(messageId, OWNER_LANG);
    assert.ok(translation, "an originalBody row must be persisted");
    assert.equal(translation?.translatedText, "we're praying for you");
    assert.equal(translation?.status, "ready");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("handleAdminReply: does NOT create a translation row when originalBody is absent", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const result = await handleAdminReply({
      ownerId: "1",
      rawBody: { conversationId: conversation.id, body: "we're praying for you" },
    });

    assert.equal(result.status, 200);
    const messageId = (result.body as { id: number }).id;

    const translation = await getTranslation(messageId, OWNER_LANG);
    assert.equal(translation, null, "no row must be created when originalBody is absent");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("handleAdminReply: does NOT create a translation row when originalBody equals body (no preview edit occurred)", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const result = await handleAdminReply({
      ownerId: "1",
      rawBody: {
        conversationId: conversation.id,
        body: "we're praying for you",
        originalBody: "we're praying for you",
      },
    });

    assert.equal(result.status, 200);
    const messageId = (result.body as { id: number }).id;

    const translation = await getTranslation(messageId, OWNER_LANG);
    assert.equal(translation, null, "no row must be created when originalBody equals body (same-language/no-edit case)");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});
