import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "../db/pool.ts";
import { getOrCreate as getOrCreateVisitor } from "./visitors.ts";
import { recordGranted, recordPromptReached, recordShown, statsByPlatform } from "./gateFunnel.ts";

// node:test runs each file in its own process; without closing the pool the
// process never exits (open sockets keep the event loop alive) and the
// whole `node --test` run hangs waiting on this file's child process.
after(async () => {
  await sql.end({ timeout: 5 });
});

async function cleanup(visitorId: string) {
  await sql`delete from push_gate_funnel where visitor_id = ${visitorId}`;
  await sql`delete from visitors where id = ${visitorId}`;
}

// The shared `sql` client (db/pool.ts) has its timestamp parsers disabled
// by drizzle(sql, {schema}) (drizzle-orm/postgres-js registers a
// transparent parser for timestamp OIDs so it can apply its own
// mode-aware conversion) -- a raw `sql` tagged query like this one
// therefore returns timestamp columns as Postgres's text representation,
// not a parsed Date. String equality is sufficient here: this helper only
// needs to detect whether a stage timestamp moved between two reads.
async function readRow(visitorId: string) {
  const [row] = await sql<
    { shown_at: string | null; prompt_reached_at: string | null; granted_at: string | null }[]
  >`select shown_at, prompt_reached_at, granted_at from push_gate_funnel where visitor_id = ${visitorId}`;
  return row;
}

test("gateFunnel.recordShown: a repeated call for the same visitor leaves shown_at unchanged (ID-03 idempotency)", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    await recordShown(visitor.id, "ios");
    const first = await readRow(visitor.id);
    assert.ok(first.shown_at, "shown_at must be set on the first call");

    // A short delay so a bug that re-stamps `now()` would produce a
    // detectably different timestamp.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await recordShown(visitor.id, "ios");
    const second = await readRow(visitor.id);

    assert.equal(
      second.shown_at,
      first.shown_at,
      "a repeated recordShown call must never move an already-set shown_at",
    );
  } finally {
    await cleanup(visitor.id);
  }
});

test("gateFunnel.recordShown: concurrent calls for the same visitor are idempotent, no duplicate rows", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    await Promise.all([
      recordShown(visitor.id, "ios"),
      recordShown(visitor.id, "ios"),
      recordShown(visitor.id, "ios"),
    ]);

    const rows = await sql`select * from push_gate_funnel where visitor_id = ${visitor.id}`;
    assert.equal(rows.length, 1, "concurrent calls must never create duplicate rows");
  } finally {
    await cleanup(visitor.id);
  }
});

test("gateFunnel.recordPromptReached / recordGranted: each stage sets once, independent of the others", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    await recordShown(visitor.id, "other");
    await recordPromptReached(visitor.id, "other");
    await recordGranted(visitor.id, "other");

    const row = await readRow(visitor.id);
    assert.ok(row.shown_at);
    assert.ok(row.prompt_reached_at);
    assert.ok(row.granted_at);

    // Repeat all three -- none should move.
    const before = { ...row };
    await recordShown(visitor.id, "other");
    await recordPromptReached(visitor.id, "other");
    await recordGranted(visitor.id, "other");
    const after2 = await readRow(visitor.id);

    assert.equal(after2.shown_at, before.shown_at);
    assert.equal(after2.prompt_reached_at, before.prompt_reached_at);
    assert.equal(after2.granted_at, before.granted_at);
  } finally {
    await cleanup(visitor.id);
  }
});

test("gateFunnel.statsByPlatform: counts non-null stage columns grouped by platform, recomputed fresh", async () => {
  const visitorA = await getOrCreateVisitor();
  const visitorB = await getOrCreateVisitor();
  try {
    await recordShown(visitorA.id, "ios");
    await recordPromptReached(visitorA.id, "ios");
    await recordGranted(visitorA.id, "ios");

    await recordShown(visitorB.id, "ios");
    // visitorB never reaches prompt or granted.

    const stats = await statsByPlatform();
    const ios = stats.find((s) => s.platform === "ios");

    assert.ok(ios, "an 'ios' row must exist once at least one ios visitor has a funnel row");
    assert.ok(ios.shown >= 2, "shown must count both ios visitors");
    assert.ok(ios.promptReached >= 1, "promptReached must count only visitorA");
    assert.ok(ios.granted >= 1, "granted must count only visitorA");
  } finally {
    await cleanup(visitorA.id);
    await cleanup(visitorB.id);
  }
});
