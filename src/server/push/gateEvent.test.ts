import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "../db/pool.ts";
import { getOrCreate as getOrCreateVisitor } from "../repo/visitors.ts";
import { handleGateEvent } from "./gateEvent.ts";

after(async () => {
  await sql.end({ timeout: 5 });
});

async function cleanup(visitorId: string) {
  await sql`delete from push_gate_funnel where visitor_id = ${visitorId}`;
  await sql`delete from visitors where id = ${visitorId}`;
}

async function readRow(visitorId: string) {
  const [row] = await sql<
    { shown_at: string | null; prompt_reached_at: string | null }[]
  >`select shown_at, prompt_reached_at from push_gate_funnel where visitor_id = ${visitorId}`;
  return row;
}

test("handleGateEvent: kind:'shown' records the shown funnel stage", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    const result = await handleGateEvent({
      visitorId: visitor.id,
      rawBody: { kind: "shown", platform: "ios" },
    });
    assert.deepEqual(result, { status: 200 });

    const row = await readRow(visitor.id);
    assert.ok(row.shown_at);
    assert.equal(row.prompt_reached_at, null);
  } finally {
    await cleanup(visitor.id);
  }
});

test("handleGateEvent: kind:'prompt_reached' records the prompt-reached funnel stage", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    const result = await handleGateEvent({
      visitorId: visitor.id,
      rawBody: { kind: "prompt_reached", platform: "other" },
    });
    assert.deepEqual(result, { status: 200 });

    const row = await readRow(visitor.id);
    assert.ok(row.prompt_reached_at);
  } finally {
    await cleanup(visitor.id);
  }
});

test("handleGateEvent: rejects an unknown kind with {status:400}", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    const result = await handleGateEvent({
      visitorId: visitor.id,
      rawBody: { kind: "bogus", platform: "ios" },
    });
    assert.equal(result.status, 400);
  } finally {
    await cleanup(visitor.id);
  }
});
