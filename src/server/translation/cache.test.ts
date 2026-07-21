import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { sql } from "../db/pool.ts";
import { getOrCreate as getOrCreateVisitor } from "../repo/visitors.ts";
import { openFor } from "../repo/conversations.ts";
import { create as createMessage } from "../repo/messages.ts";
import { get } from "../repo/messageTranslations.ts";
import { translateAndCache } from "./cache.ts";
import { FAILURE_THRESHOLD, isOpen, recordFailure, recordSuccess } from "./circuit-breaker.ts";
import { openaiClient } from "./translate.ts";

// node:test runs each file in its own process; without closing the pool the
// process never exits (open sockets keep the event loop alive) and the
// whole `node --test` run hangs waiting on this file's child process.
after(async () => {
  await sql.end({ timeout: 5 });
});

// The breaker's state is a globalThis-pinned singleton shared across every
// test in this file (by design -- see circuit-breaker.ts's header comment).
// Reset it to closed before each test so ordering never matters; individual
// tests then set up whatever pre-condition (open/near-open) they need on
// top of this guaranteed-closed baseline.
beforeEach(() => {
  recordSuccess();
});

function chatResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

async function makeMessage() {
  const visitor = await getOrCreateVisitor();
  const conversation = await openFor(visitor.id);
  const message = await createMessage(conversation.id, "visitor", "Hello there");
  return { visitor, conversation, message };
}

async function cleanup(conversationId: number, visitorId: string) {
  await sql`delete from message_translations where message_id in (select id from messages where conversation_id = ${conversationId})`;
  await sql`delete from messages where conversation_id = ${conversationId}`;
  await sql`delete from conversations where id = ${conversationId}`;
  await sql`delete from visitors where id = ${visitorId}`;
}

test("cache.translateAndCache: no-op (no translate() call, no row written) when sourceLang === targetLang", async (t) => {
  const { visitor, conversation, message } = await makeMessage();
  try {
    const createSpy = t.mock.method(openaiClient.chat.completions, "create", async () => {
      throw new Error("translate() must never be called for a same-language pair");
    });

    await translateAndCache(message.id, "Hello there", "en", "en");

    assert.equal(createSpy.mock.callCount(), 0, "translate() must not be called");
    const row = await get(message.id, "en");
    assert.equal(row, null, "no row must be written for a same-language skip");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("cache.translateAndCache: skips the translate() call and writes no row when circuit-breaker.isOpen() is true", async (t) => {
  const { visitor, conversation, message } = await makeMessage();
  try {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) recordFailure();
    assert.equal(isOpen(), true, "precondition: breaker must be open before this test's real assertion");

    const createSpy = t.mock.method(openaiClient.chat.completions, "create", async () => {
      throw new Error("translate() must never be called while the breaker is open");
    });

    await translateAndCache(message.id, "Hello there", "en", "es");

    assert.equal(createSpy.mock.callCount(), 0, "translate() must not be called while the breaker is open");
    const row = await get(message.id, "es");
    assert.equal(row, null, "no row must be written when the call is skipped by the breaker");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("cache.translateAndCache: persists status='ready' and resets the breaker when translate() succeeds AND all four validators pass", async (t) => {
  const { visitor, conversation, message } = await makeMessage();
  try {
    // Two consecutive failures -- still below FAILURE_THRESHOLD (3) --
    // establishes a non-zero baseline so a subsequent recordSuccess() reset
    // is observable below.
    recordFailure();
    recordFailure();

    t.mock.method(openaiClient.chat.completions, "create", async () => chatResponse('{"translation": "Hola amigo"}'));

    await translateAndCache(message.id, "Hello there", "en", "es");

    const row = await get(message.id, "es");
    assert.equal(row?.status, "ready");
    assert.equal(row?.translatedText, "Hola amigo");

    // A successful call must call circuit-breaker.recordSuccess(), which
    // resets the consecutive-failure count to 0 -- one more failure alone
    // must not reopen the breaker (it would if the prior 2 failures had
    // survived uncleared).
    recordFailure();
    assert.equal(isOpen(), false, "a successful translateAndCache call must reset the consecutive-failure count");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("cache.translateAndCache: persists status='failed' and records a circuit-breaker failure when translate() itself fails", async (t) => {
  const { visitor, conversation, message } = await makeMessage();
  try {
    t.mock.method(openaiClient.chat.completions, "create", async () => {
      throw new Error("simulated provider outage");
    });

    await translateAndCache(message.id, "Hello there", "en", "es");

    const row = await get(message.id, "es");
    assert.equal(row?.status, "failed");
    assert.equal(row?.translatedText, null);

    // translateAndCache must have recorded exactly one failure -- two more
    // manual failures should cross FAILURE_THRESHOLD (3) and open the
    // breaker.
    recordFailure();
    recordFailure();
    assert.equal(isOpen(), true, "translateAndCache's own failure must count toward the threshold");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("cache.translateAndCache: persists status='failed' when translate() succeeds but a TRANS-07 validator fails (refusal marker)", async (t) => {
  const { visitor, conversation, message } = await makeMessage();
  try {
    t.mock.method(openaiClient.chat.completions, "create", async () =>
      chatResponse('{"translation": "I\'m sorry, I cannot help with that request."}'),
    );

    await translateAndCache(message.id, "Hello there", "en", "es");

    const row = await get(message.id, "es");
    assert.equal(row?.status, "failed", "a refusal-marker response must be treated as a hard failure");
    assert.equal(row?.translatedText, null);
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});
