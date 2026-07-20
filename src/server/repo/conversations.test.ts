import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "../db/pool.ts";
import { getOrCreate as getOrCreateVisitor } from "./visitors.ts";
import { openFor } from "./conversations.ts";

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
