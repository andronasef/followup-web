import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "../db/pool.ts";
import { getOrCreate as getOrCreateVisitor } from "./visitors.ts";
import { create, deleteByEndpoint, listForVisitor, markFailure, markSuccess } from "./pushSubscriptions.ts";

// node:test runs each file in its own process; without closing the pool the
// process never exits (open sockets keep the event loop alive) and the
// whole `node --test` run hangs waiting on this file's child process.
after(async () => {
  await sql.end({ timeout: 5 });
});

async function cleanup(visitorId: string) {
  await sql`delete from push_subscriptions where visitor_id = ${visitorId}`;
  await sql`delete from visitors where id = ${visitorId}`;
}

test("pushSubscriptions.create: a fresh endpoint inserts a new row", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    const row = await create(visitor.id, endpoint, "p256dh-key", "auth-secret");

    assert.equal(row.visitorId, visitor.id);
    assert.equal(row.endpoint, endpoint);
    assert.equal(row.p256dh, "p256dh-key");
    assert.equal(row.auth, "auth-secret");
    assert.equal(row.failureCount, 0);
  } finally {
    await cleanup(visitor.id);
  }
});

test("pushSubscriptions.create: re-subscribing an existing endpoint updates in place, never errors", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    const first = await create(visitor.id, endpoint, "old-p256dh", "old-auth");
    const second = await create(visitor.id, endpoint, "new-p256dh", "new-auth");

    assert.equal(first.id, second.id, "re-subscribing the same endpoint must update the same row");
    assert.equal(second.p256dh, "new-p256dh");
    assert.equal(second.auth, "new-auth");

    const rows = await listForVisitor(visitor.id);
    assert.equal(rows.length, 1, "must not create a second row for the same endpoint");
  } finally {
    await cleanup(visitor.id);
  }
});

test("pushSubscriptions.create: CR-01 the endpoint-to-visitor binding is set-once -- a different visitor never takes the row over", async () => {
  const owner = await getOrCreateVisitor();
  const intruder = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    const original = await create(owner.id, endpoint, "owner-p256dh", "owner-auth");
    assert.equal(original.visitorId, owner.id);

    const afterIntruder = await create(intruder.id, endpoint, "intruder-p256dh", "intruder-auth");

    assert.equal(afterIntruder.id, original.id, "must still be the same row");
    assert.equal(
      afterIntruder.visitorId,
      owner.id,
      "the owning visitor must NOT be reassigned -- that orphans the original visitor's conversation",
    );
    assert.equal(afterIntruder.p256dh, "intruder-p256dh", "the encryption keys must still be refreshed");
    assert.equal(afterIntruder.auth, "intruder-auth");

    assert.equal((await listForVisitor(owner.id)).length, 1, "the row must still belong to the original owner");
    assert.equal((await listForVisitor(intruder.id)).length, 0, "the caller must not have acquired the row");
  } finally {
    await cleanup(owner.id);
    await cleanup(intruder.id);
  }
});

test("pushSubscriptions.deleteByEndpoint: removes the subscription (PUSH-10 404/410 cleanup)", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    await create(visitor.id, endpoint, "p256dh-key", "auth-secret");

    await deleteByEndpoint(endpoint);

    const rows = await listForVisitor(visitor.id);
    assert.equal(rows.length, 0);
  } finally {
    await cleanup(visitor.id);
  }
});

test("pushSubscriptions.markSuccess: sets lastSuccessAt and resets failureCount", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    await create(visitor.id, endpoint, "p256dh-key", "auth-secret");
    await markFailure(endpoint);
    await markFailure(endpoint);

    await markSuccess(endpoint);

    const [row] = await listForVisitor(visitor.id);
    assert.ok(row.lastSuccessAt, "lastSuccessAt must be set");
    assert.equal(row.failureCount, 0, "failureCount must reset to 0 on success");
  } finally {
    await cleanup(visitor.id);
  }
});

test("pushSubscriptions.markFailure: increments failureCount atomically", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    await create(visitor.id, endpoint, "p256dh-key", "auth-secret");

    await markFailure(endpoint);
    await markFailure(endpoint);
    await markFailure(endpoint);

    const [row] = await listForVisitor(visitor.id);
    assert.equal(row.failureCount, 3);
  } finally {
    await cleanup(visitor.id);
  }
});
