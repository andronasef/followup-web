import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "../../../../server/db/pool.ts";
import { OWNER_LANG } from "../../../../server/config/models.ts";
import { getOrCreate as getOrCreateVisitor } from "../../../../server/repo/visitors.ts";
import { openFor } from "../../../../server/repo/conversations.ts";
import { openaiClient } from "../../../../server/translation/translate.ts";
import { translatePreview } from "./translate-preview.ts";

// node:test runs each file in its own process; without closing the pool the
// process never exits and the whole `node --test` run hangs.
after(async () => {
  await sql.end({ timeout: 5 });
});

// A visitor language guaranteed to differ from whatever OWNER_LANG is
// configured to, so the "different language" tests below never accidentally
// collapse into the same-language skip path.
const DIFFERENT_LANG = OWNER_LANG === "es" ? "fr" : "es";

function chatResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

async function conversationWithVisitorLang(lang: string) {
  const visitor = await getOrCreateVisitor(null, lang);
  const conversation = await openFor(visitor.id);
  return { visitor, conversation };
}

async function cleanup(conversationId: number, visitorId: string) {
  await sql`delete from conversations where id = ${conversationId}`;
  await sql`delete from visitors where id = ${visitorId}`;
}

test("translatePreview: without a valid owner session (ownerId: null) returns 401 without parsing the body", async () => {
  const result = await translatePreview({ ownerId: null, rawBody: "not even an object, would fail zod parsing" });
  assert.equal(result.status, 401);
});

test("translatePreview: a valid draft returns {translatedText} when the visitor's language differs from OWNER_LANG and translation succeeds", async (t) => {
  const { visitor, conversation } = await conversationWithVisitorLang(DIFFERENT_LANG);
  try {
    t.mock.method(openaiClient.chat.completions, "create", async () => chatResponse('{"translation": "Hola amigo"}'));

    const result = await translatePreview({
      ownerId: "1",
      rawBody: { conversationId: conversation.id, draftText: "Hello friend" },
    });

    assert.equal(result.status, 200);
    assert.equal((result.body as { translatedText: string }).translatedText, "Hola amigo");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("translatePreview: returns the draft unchanged with no LLM call when the visitor's language equals OWNER_LANG", async (t) => {
  const { visitor, conversation } = await conversationWithVisitorLang(OWNER_LANG);
  try {
    const createSpy = t.mock.method(openaiClient.chat.completions, "create", async () => {
      throw new Error("translate() must never be called for a same-language preview");
    });

    const result = await translatePreview({
      ownerId: "1",
      rawBody: { conversationId: conversation.id, draftText: "Hello friend" },
    });

    assert.equal(result.status, 200);
    assert.equal((result.body as { translatedText: string }).translatedText, "Hello friend");
    assert.equal(createSpy.mock.callCount(), 0);
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("translatePreview: returns {translatedText: null, failed: true} (never a 500) when translate() fails", async (t) => {
  const { visitor, conversation } = await conversationWithVisitorLang(DIFFERENT_LANG);
  try {
    t.mock.method(openaiClient.chat.completions, "create", async () => {
      throw new Error("simulated provider outage");
    });

    const result = await translatePreview({
      ownerId: "1",
      rawBody: { conversationId: conversation.id, draftText: "Hello friend" },
    });

    assert.equal(result.status, 200, "a translation failure must never surface as a 500");
    assert.deepEqual(result.body, { translatedText: null, failed: true });
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("translatePreview: returns {translatedText: null, failed: true} when translate() succeeds but a TRANS-07 validator fails", async (t) => {
  const { visitor, conversation } = await conversationWithVisitorLang(DIFFERENT_LANG);
  try {
    t.mock.method(openaiClient.chat.completions, "create", async () =>
      chatResponse('{"translation": "I\'m sorry, I cannot help with that request."}'),
    );

    const result = await translatePreview({
      ownerId: "1",
      rawBody: { conversationId: conversation.id, draftText: "Hello friend" },
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { translatedText: null, failed: true });
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});
