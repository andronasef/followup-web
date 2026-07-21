import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "../db/pool.ts";
import { getOrCreate as getOrCreateVisitor } from "./visitors.ts";
import { openFor } from "./conversations.ts";
import { create as createMessage } from "./messages.ts";
import { get, listForMessageIds, upsert } from "./messageTranslations.ts";

// node:test runs each file in its own process; without closing the pool the
// process never exits (open sockets keep the event loop alive) and the
// whole `node --test` run hangs waiting on this file's child process.
after(async () => {
  await sql.end({ timeout: 5 });
});

async function makeMessage() {
  const visitor = await getOrCreateVisitor();
  const conversation = await openFor(visitor.id);
  const message = await createMessage(conversation.id, "visitor", "hello there");
  return { visitor, conversation, message };
}

async function cleanup(conversationId: number, visitorId: string) {
  await sql`delete from message_translations where message_id in (select id from messages where conversation_id = ${conversationId})`;
  await sql`delete from messages where conversation_id = ${conversationId}`;
  await sql`delete from conversations where id = ${conversationId}`;
  await sql`delete from visitors where id = ${visitorId}`;
}

test("messageTranslations.upsert: inserts a new row when none exists for the (messageId, targetLang) pair", async () => {
  const { visitor, conversation, message } = await makeMessage();
  try {
    await upsert(message.id, "en", "hello there", "ready");
    const row = await get(message.id, "en");
    assert.ok(row, "a row must exist after upsert");
    assert.equal(row?.translatedText, "hello there");
    assert.equal(row?.status, "ready");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("messageTranslations.upsert: a second call for the SAME (messageId, targetLang) pair is a no-op", async () => {
  const { visitor, conversation, message } = await makeMessage();
  try {
    await upsert(message.id, "en", "original translation", "ready");
    await upsert(message.id, "en", "a different translation", "failed");

    const row = await get(message.id, "en");
    assert.equal(row?.translatedText, "original translation", "the original row's translatedText must be unchanged");
    assert.equal(row?.status, "ready", "the original row's status must be unchanged");

    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count from message_translations where message_id = ${message.id} and target_lang = 'en'
    `;
    assert.equal(rows[0]!.count, 1, "a duplicate upsert must never insert a second row");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("messageTranslations.get: returns null when no row exists", async () => {
  const { visitor, conversation, message } = await makeMessage();
  try {
    const row = await get(message.id, "fr");
    assert.equal(row, null);
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("messageTranslations.listForMessageIds: an empty array returns an empty Map without querying", async () => {
  const result = await listForMessageIds([], "en");
  assert.equal(result.size, 0);
});

test("messageTranslations.listForMessageIds: returns a Map keyed by messageId for the given targetLang", async () => {
  const { visitor, conversation, message } = await makeMessage();
  try {
    await upsert(message.id, "en", "hello there", "ready");
    const result = await listForMessageIds([message.id], "en");
    assert.equal(result.get(message.id)?.translatedText, "hello there");
    assert.equal(result.get(message.id)?.status, "ready");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});
