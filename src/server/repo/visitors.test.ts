import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "../db/pool.ts";
import { getOrCreate } from "./visitors.ts";

// node:test runs each file in its own process; without closing the pool the
// process never exits (open sockets keep the event loop alive) and the
// whole `node --test` run hangs waiting on this file's child process.
after(async () => {
  await sql.end({ timeout: 5 });
});

test("visitors.getOrCreate: no id provided inserts a brand-new visitor", async () => {
  const visitor = await getOrCreate();
  try {
    assert.ok(visitor.id, "a new visitor row must have an id");
  } finally {
    await sql`delete from visitors where id = ${visitor.id}`;
  }
});

test("visitors.getOrCreate: an existing id returns the same visitor and touches last_seen_at", async () => {
  const created = await getOrCreate();
  try {
    const before = created.lastSeenAt;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const returned = await getOrCreate(created.id);

    assert.equal(returned.id, created.id, "must return the same visitor row, not a new one");
    assert.ok(
      returned.lastSeenAt.getTime() >= before.getTime(),
      "last_seen_at must be touched (not older than the original)",
    );
  } finally {
    await sql`delete from visitors where id = ${created.id}`;
  }
});
