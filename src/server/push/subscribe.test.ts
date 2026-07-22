import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "../db/pool.ts";
import { webpush } from "./vapid.ts";
import { verifySession } from "../auth/session.ts";
import { getOrCreate as getOrCreateVisitor } from "../repo/visitors.ts";
import { listForVisitor } from "../repo/pushSubscriptions.ts";
import { handleSubscribe } from "./subscribe.ts";

// node:test runs each file in its own process; without closing the pool the
// process never exits (open sockets keep the event loop alive).
after(async () => {
  await sql.end({ timeout: 5 });
});

async function cleanup(visitorId: string) {
  await sql`delete from push_subscriptions where visitor_id = ${visitorId}`;
  await sql`delete from push_gate_funnel where visitor_id = ${visitorId}`;
  await sql`delete from visitors where id = ${visitorId}`;
}

function subscriptionBody(endpoint: string, platform: "ios" | "other" = "other") {
  return {
    subscription: {
      endpoint,
      keys: { p256dh: "p256dh-test-key", auth: "auth-test-secret" },
    },
    platform,
  };
}

test("handleSubscribe: a well-formed subscription upserts a row and returns probeOk:true when the probe succeeds", async (t) => {
  t.mock.method(webpush, "sendNotification", async () => ({ statusCode: 201 }));
  const visitor = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    const result = await handleSubscribe({
      visitorId: visitor.id,
      lang: "en",
      rawBody: subscriptionBody(endpoint),
    });

    assert.deepEqual(result, { status: 200, body: { probeOk: true } });

    const rows = await listForVisitor(visitor.id);
    assert.equal(rows.length, 1, "a pushSubscriptions row must be upserted");
    assert.equal(rows[0].endpoint, endpoint);
  } finally {
    await cleanup(visitor.id);
  }
});

test("handleSubscribe: returns {status:200, body:{probeOk:false}} (never an error status) when the probe send throws", async (t) => {
  t.mock.method(webpush, "sendNotification", async () => {
    throw new Error("simulated push service failure");
  });
  const visitor = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    const result = await handleSubscribe({
      visitorId: visitor.id,
      lang: "en",
      rawBody: subscriptionBody(endpoint),
    });

    assert.deepEqual(result, { status: 200, body: { probeOk: false } });
  } finally {
    await cleanup(visitor.id);
  }
});

test("handleSubscribe: calls gateFunnel.recordGranted exactly once per call, on both the success and probe-failure paths", async (t) => {
  const visitor = await getOrCreateVisitor();
  try {
    t.mock.method(webpush, "sendNotification", async () => ({ statusCode: 201 }));
    const endpointA = `https://push.example.com/${randomUUID()}`;
    await handleSubscribe({ visitorId: visitor.id, lang: "en", rawBody: subscriptionBody(endpointA) });

    const [rowAfterSuccess] = await sql<
      { granted_at: string | null }[]
    >`select granted_at from push_gate_funnel where visitor_id = ${visitor.id}`;
    assert.ok(rowAfterSuccess.granted_at, "granted_at must be set after a successful probe");

    // A second visitor exercises the failure path independently, so a
    // set-once column on the first visitor can't mask a missed call.
    const visitor2 = await getOrCreateVisitor();
    try {
      t.mock.method(webpush, "sendNotification", async () => {
        throw new Error("simulated failure");
      });
      const endpointB = `https://push.example.com/${randomUUID()}`;
      await handleSubscribe({ visitorId: visitor2.id, lang: "en", rawBody: subscriptionBody(endpointB) });

      const [rowAfterFailure] = await sql<
        { granted_at: string | null }[]
      >`select granted_at from push_gate_funnel where visitor_id = ${visitor2.id}`;
      assert.ok(rowAfterFailure.granted_at, "granted_at must be set even when the probe send throws");
    } finally {
      await cleanup(visitor2.id);
    }
  } finally {
    await cleanup(visitor.id);
  }
});

test("handleSubscribe: CR-01 an endpoint owned by another visitor returns 409, sends no probe, and records no grant", async (t) => {
  const owner = await getOrCreateVisitor();
  const intruder = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    t.mock.method(webpush, "sendNotification", async () => ({ statusCode: 201 }));
    await handleSubscribe({ visitorId: owner.id, lang: "en", rawBody: subscriptionBody(endpoint) });

    const sendMock = t.mock.method(webpush, "sendNotification", async () => ({ statusCode: 201 }));
    const result = await handleSubscribe({
      visitorId: intruder.id,
      lang: "en",
      rawBody: subscriptionBody(endpoint),
    });

    assert.deepEqual(result, { status: 409, body: { error: "endpoint_owned_by_other_visitor" } });
    assert.equal(sendMock.mock.calls.length, 0, "no probe may be sent to another visitor's device");

    const funnelRows = await sql`select 1 from push_gate_funnel where visitor_id = ${intruder.id}`;
    assert.equal(funnelRows.length, 0, "a conflicting subscribe must not pollute the gate funnel");

    assert.equal((await listForVisitor(owner.id)).length, 1, "the row must still belong to the original owner");
    assert.equal((await listForVisitor(intruder.id)).length, 0);
  } finally {
    await cleanup(owner.id);
    await cleanup(intruder.id);
  }
});

test("handleSubscribe: re-subscribing an endpoint the SAME visitor already owns is unchanged (200, probe sent, grant recorded)", async (t) => {
  const visitor = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    t.mock.method(webpush, "sendNotification", async () => ({ statusCode: 201 }));
    await handleSubscribe({ visitorId: visitor.id, lang: "en", rawBody: subscriptionBody(endpoint) });

    const sendMock = t.mock.method(webpush, "sendNotification", async () => ({ statusCode: 201 }));
    const result = await handleSubscribe({ visitorId: visitor.id, lang: "en", rawBody: subscriptionBody(endpoint) });

    assert.deepEqual(result, { status: 200, body: { probeOk: true } });
    assert.equal(sendMock.mock.calls.length, 1, "the same-owner path must still probe");
  } finally {
    await cleanup(visitor.id);
  }
});

test("handleSubscribe: CR-08 the probe payload carries a top-level tag equal to its web-push topic, and still no message content", async (t) => {
  let capturedPayload = "";
  let capturedTopic = "";
  t.mock.method(webpush, "sendNotification", async (_sub: unknown, payload: string, options: { topic: string }) => {
    capturedPayload = payload;
    capturedTopic = options.topic;
    return { statusCode: 201 };
  });
  const visitor = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    await handleSubscribe({ visitorId: visitor.id, lang: "en", rawBody: subscriptionBody(endpoint) });

    const parsed = JSON.parse(capturedPayload);
    assert.equal(parsed.tag, `probe-${visitor.id}`);
    assert.equal(parsed.tag, capturedTopic, "the tag and the topic must be the one same routing key");
    assert.equal(typeof parsed.data.vid, "string");
    assert.deepEqual(Object.keys(parsed.data), ["vid"], "the payload's data must carry nothing but the vid token");
  } finally {
    await cleanup(visitor.id);
  }
});

test("handleSubscribe: rejects a malformed subscription body (missing endpoint or keys) with {status:400}", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    const result = await handleSubscribe({
      visitorId: visitor.id,
      lang: "en",
      rawBody: { subscription: { endpoint: "https://push.example.com/x" }, platform: "other" },
    });
    assert.equal(result.status, 400);
  } finally {
    await cleanup(visitor.id);
  }
});

test("handleSubscribe: the probe payload's data.vid is a real signVisitorId-signed JWT decodable back to the same visitorId", async (t) => {
  let capturedPayload: string | undefined;
  t.mock.method(webpush, "sendNotification", async (_sub: unknown, payload: string) => {
    capturedPayload = payload;
    return { statusCode: 201 };
  });
  const visitor = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    await handleSubscribe({ visitorId: visitor.id, lang: "en", rawBody: subscriptionBody(endpoint) });

    assert.ok(capturedPayload, "sendNotification must have been called with a payload");
    const parsed = JSON.parse(capturedPayload!);
    assert.equal(typeof parsed.data.vid, "string");
    assert.notEqual(parsed.data.vid, null);

    const decoded = await verifySession(parsed.data.vid);
    assert.equal(decoded.sub, visitor.id);
    assert.equal(decoded.typ, "visitor");
  } finally {
    await cleanup(visitor.id);
  }
});
