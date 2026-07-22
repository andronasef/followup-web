import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "../db/pool.ts";
import { randomUUID } from "node:crypto";
import { getOrCreate, updatePrefs } from "./visitors.ts";

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

test("visitors.updatePrefs: CR-02 a written lang is readable back off the visitors row", async () => {
  const visitor = await getOrCreate(null, "en", "system");
  try {
    const updated = await updatePrefs(visitor.id, "ar", "dark");
    assert.ok(updated, "an existing visitor must return the updated row");
    assert.equal(updated!.lang, "ar");
    assert.equal(updated!.appearance, "dark");

    const [row] = await sql<{ lang: string; appearance: string }[]>`
      select lang, appearance from visitors where id = ${visitor.id}`;
    assert.equal(row.lang, "ar", "the choice must be persisted, not just returned");
    assert.equal(row.appearance, "dark");
  } finally {
    await sql`delete from visitors where id = ${visitor.id}`;
  }
});

test("visitors.updatePrefs: an omitted argument leaves that column untouched", async () => {
  const visitor = await getOrCreate(null, "en", "light");
  try {
    const updated = await updatePrefs(visitor.id, "sw");
    assert.equal(updated!.lang, "sw");
    assert.equal(updated!.appearance, "light", "appearance must survive a lang-only update");
  } finally {
    await sql`delete from visitors where id = ${visitor.id}`;
  }
});

test("visitors.updatePrefs: an unknown visitor id is a silent no-op returning null, never an insert", async () => {
  const before = await sql<{ count: string }[]>`select count(*)::text as count from visitors`;
  const result = await updatePrefs(randomUUID(), "ar", "dark");
  const after = await sql<{ count: string }[]>`select count(*)::text as count from visitors`;

  assert.equal(result, null);
  assert.equal(after[0].count, before[0].count, "updatePrefs must never mint a visitor row");
});
