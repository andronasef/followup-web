import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "../db/pool.ts";
import { getOrCreate as getOrCreateVisitor } from "./visitors.ts";
import { getVisitorLangFor, openFor } from "./conversations.ts";

// node:test runs each file in its own process; without closing the pool the
// process never exits (open sockets keep the event loop alive) and the
// whole `node --test` run hangs waiting on this file's child process.
after(async () => {
  await sql.end({ timeout: 5 });
});

async function cleanup(visitorId: string) {
  await sql`delete from conversations where visitor_id = ${visitorId}`;
  await sql`delete from visitors where id = ${visitorId}`;
}

test("conversations.openFor: repeated calls for the same visitor return the same conversation id", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    const first = await openFor(visitor.id);
    const second = await openFor(visitor.id);
    assert.equal(first.id, second.id, "the partial unique index must resolve to the one open conversation");
  } finally {
    await cleanup(visitor.id);
  }
});

test("conversations.openFor: concurrent calls for the same visitor never create a duplicate open conversation", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    const [a, b, c] = await Promise.all([openFor(visitor.id), openFor(visitor.id), openFor(visitor.id)]);
    assert.equal(a.id, b.id);
    assert.equal(b.id, c.id);

    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count from conversations where visitor_id = ${visitor.id}
    `;
    assert.equal(rows[0].count, 1, "concurrent opens for one visitor must resolve to exactly one row");
  } finally {
    await cleanup(visitor.id);
  }
});

test("conversations.getVisitorLangFor: returns the visitor's stored lang for their conversation", async () => {
  const visitor = await getOrCreateVisitor(null, "fr");
  const conversation = await openFor(visitor.id);
  try {
    const lang = await getVisitorLangFor(conversation.id);
    assert.equal(lang, "fr");
  } finally {
    await cleanup(visitor.id);
  }
});

test("conversations.getVisitorLangFor: returns null for a nonexistent conversation id", async () => {
  const lang = await getVisitorLangFor(-1);
  assert.equal(lang, null);
});

test("conversations.getVisitorLangFor: returns null when the visitor's lang column is null", async () => {
  const visitor = await getOrCreateVisitor();
  const conversation = await openFor(visitor.id);
  try {
    const lang = await getVisitorLangFor(conversation.id);
    assert.equal(lang, null, "caller is responsible for defaulting a null lang to 'en'");
  } finally {
    await cleanup(visitor.id);
  }
});
