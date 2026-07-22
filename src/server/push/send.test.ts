import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "../db/pool.ts";
import { webpush } from "./vapid.ts";
import { verifySession } from "../auth/session.ts";
import { getOrCreate as getOrCreateVisitor } from "../repo/visitors.ts";
import { openFor } from "../repo/conversations.ts";
import { create as createMessage, markDelivered } from "../repo/messages.ts";
import { create as createSubscription, listForVisitor } from "../repo/pushSubscriptions.ts";
import { buildContentFreePayload, sendPushToVisitor } from "./send.ts";

// Skips the real 8s ACK_GRACE_PERIOD_MS sleep via send.ts's injectable
// `wait` seam, rather than globally faking setTimeout (node:test's
// mock.timers also intercepts the DB driver's own internal setTimeout
// calls made by the repo queries this function makes after the grace
// period, hanging every test -- confirmed empirically, see send.ts's own
// doc comment on the `wait` parameter).
const noWait = () => Promise.resolve();

// node:test runs each file in its own process; without closing the pool the
// process never exits.
after(async () => {
  await sql.end({ timeout: 5 });
});

async function makeVisitorConversation() {
  const visitor = await getOrCreateVisitor();
  const conversation = await openFor(visitor.id);
  return { visitor, conversation };
}

async function cleanup(visitorId: string, conversationId: number) {
  await sql`delete from push_subscriptions where visitor_id = ${visitorId}`;
  await sql`delete from messages where conversation_id = ${conversationId}`;
  await sql`delete from conversations where id = ${conversationId}`;
  await sql`delete from visitors where id = ${visitorId}`;
}

test("sendPushToVisitor: skips sending entirely if messages.deliveredAt is already non-null", async (t) => {
  const { visitor, conversation } = await makeVisitorConversation();
  try {
    const message = await createMessage(conversation.id, "owner", "hello");
    await markDelivered(message.id);
    await createSubscription(visitor.id, `https://push.example.com/${randomUUID()}`, "p256dh", "auth");

    const sendMock = t.mock.method(webpush, "sendNotification", async () => ({ statusCode: 201 }));
    await sendPushToVisitor(conversation.id, message.id, visitor.id, "en", noWait);

    assert.equal(sendMock.mock.calls.length, 0, "sendNotification must never be called for an already-delivered message");
  } finally {
    await cleanup(visitor.id, conversation.id);
  }
});

test("sendPushToVisitor: sends to every subscription in listForVisitor(visitorId) when deliveredAt is still null", async (t) => {
  const { visitor, conversation } = await makeVisitorConversation();
  try {
    const message = await createMessage(conversation.id, "owner", "hello");
    await createSubscription(visitor.id, `https://push.example.com/${randomUUID()}`, "p256dh-1", "auth-1");
    await createSubscription(visitor.id, `https://push.example.com/${randomUUID()}`, "p256dh-2", "auth-2");

    const sendMock = t.mock.method(webpush, "sendNotification", async () => ({ statusCode: 201 }));
    await sendPushToVisitor(conversation.id, message.id, visitor.id, "en", noWait);

    assert.equal(sendMock.mock.calls.length, 2, "must send to both subscriptions");
    for (const call of sendMock.mock.calls) {
      const options = call.arguments[2] as { topic: string };
      assert.equal(options.topic, `conv-${conversation.id}`);
    }
  } finally {
    await cleanup(visitor.id, conversation.id);
  }
});

test("sendPushToVisitor: a 404/410 deletes that subscription and does not throw further -- other subscriptions still attempted", async (t) => {
  const { visitor, conversation } = await makeVisitorConversation();
  try {
    const message = await createMessage(conversation.id, "owner", "hello");
    const deadEndpoint = `https://push.example.com/${randomUUID()}`;
    const aliveEndpoint = `https://push.example.com/${randomUUID()}`;
    await createSubscription(visitor.id, deadEndpoint, "p256dh-dead", "auth-dead");
    await createSubscription(visitor.id, aliveEndpoint, "p256dh-alive", "auth-alive");

    t.mock.method(webpush, "sendNotification", async (sub: { endpoint: string }) => {
      if (sub.endpoint === deadEndpoint) {
        const err = new Error("Gone") as Error & { statusCode: number };
        err.statusCode = 410;
        throw err;
      }
      return { statusCode: 201 };
    });

    await sendPushToVisitor(conversation.id, message.id, visitor.id, "en", noWait);

    const remaining = await listForVisitor(visitor.id);
    const endpoints = remaining.map((r) => r.endpoint);
    assert.ok(!endpoints.includes(deadEndpoint), "the 410 subscription must be deleted");
    assert.ok(endpoints.includes(aliveEndpoint), "the other subscription must still exist and have been attempted");
  } finally {
    await cleanup(visitor.id, conversation.id);
  }
});

test("sendPushToVisitor: a non-404/410 error marks failure and does not delete the row", async (t) => {
  const { visitor, conversation } = await makeVisitorConversation();
  try {
    const message = await createMessage(conversation.id, "owner", "hello");
    const endpoint = `https://push.example.com/${randomUUID()}`;
    await createSubscription(visitor.id, endpoint, "p256dh", "auth");

    t.mock.method(webpush, "sendNotification", async () => {
      const err = new Error("Internal Server Error") as Error & { statusCode: number };
      err.statusCode = 500;
      throw err;
    });

    await sendPushToVisitor(conversation.id, message.id, visitor.id, "en", noWait);

    const remaining = await listForVisitor(visitor.id);
    assert.equal(remaining.length, 1, "a non-404/410 error must never delete the subscription row");
    assert.equal(remaining[0].failureCount, 1);
  } finally {
    await cleanup(visitor.id, conversation.id);
  }
});

test("sendPushToVisitor: the payload never contains the triggering message's own body text", async (t) => {
  const { visitor, conversation } = await makeVisitorConversation();
  try {
    const distinctiveBody = "SECRET_PASTORAL_MESSAGE_TEXT_0xDEADBEEF";
    const message = await createMessage(conversation.id, "owner", distinctiveBody);
    await createSubscription(visitor.id, `https://push.example.com/${randomUUID()}`, "p256dh", "auth");

    let capturedPayload = "";
    t.mock.method(webpush, "sendNotification", async (_sub: unknown, payload: string) => {
      capturedPayload = payload;
      return { statusCode: 201 };
    });

    await sendPushToVisitor(conversation.id, message.id, visitor.id, "en", noWait);

    assert.ok(capturedPayload.length > 0);
    assert.ok(!capturedPayload.includes(distinctiveBody), "payload must never contain the message's own body text");
  } finally {
    await cleanup(visitor.id, conversation.id);
  }
});

test("buildContentFreePayload: CR-08 emits the caller's tag at the top level, alongside the fixed locale copy and the vid, and nothing else", () => {
  const payload = buildContentFreePayload("en", "signed-vid-token", "conv-42");

  assert.equal(payload.tag, "conv-42");
  assert.equal(typeof payload.title, "string");
  assert.ok(payload.title.length > 0);
  assert.equal(typeof payload.body, "string");
  assert.deepEqual(payload.data, { vid: "signed-vid-token" });
  assert.deepEqual(Object.keys(payload).sort(), ["body", "data", "tag", "title"]);
});

test("sendPushToVisitor: CR-08 the sent payload's top-level tag matches the conversation-scoped web-push topic", async (t) => {
  const { visitor, conversation } = await makeVisitorConversation();
  try {
    const message = await createMessage(conversation.id, "owner", "hello");
    await createSubscription(visitor.id, `https://push.example.com/${randomUUID()}`, "p256dh", "auth");

    let capturedPayload = "";
    let capturedTopic = "";
    t.mock.method(webpush, "sendNotification", async (_sub: unknown, payload: string, options: { topic: string }) => {
      capturedPayload = payload;
      capturedTopic = options.topic;
      return { statusCode: 201 };
    });

    await sendPushToVisitor(conversation.id, message.id, visitor.id, "en", noWait);

    const parsed = JSON.parse(capturedPayload);
    assert.equal(parsed.tag, `conv-${conversation.id}`);
    assert.equal(parsed.tag, capturedTopic, "device-side tag and push-service topic must be the same key");
  } finally {
    await cleanup(visitor.id, conversation.id);
  }
});

test("sendPushToVisitor: every subscription receives the SAME signed data.vid token, signed once per call", async (t) => {
  const { visitor, conversation } = await makeVisitorConversation();
  try {
    const message = await createMessage(conversation.id, "owner", "hello");
    await createSubscription(visitor.id, `https://push.example.com/${randomUUID()}`, "p256dh-1", "auth-1");
    await createSubscription(visitor.id, `https://push.example.com/${randomUUID()}`, "p256dh-2", "auth-2");

    const capturedPayloads: string[] = [];
    t.mock.method(webpush, "sendNotification", async (_sub: unknown, payload: string) => {
      capturedPayloads.push(payload);
      return { statusCode: 201 };
    });

    await sendPushToVisitor(conversation.id, message.id, visitor.id, "en", noWait);

    assert.equal(capturedPayloads.length, 2);
    const vids = capturedPayloads.map((p) => JSON.parse(p).data.vid as string);
    assert.equal(vids[0], vids[1], "every subscription must receive the same signed vid token");
    assert.notEqual(vids[0], null);

    const decoded = await verifySession(vids[0]);
    assert.equal(decoded.sub, visitor.id);
    assert.equal(decoded.typ, "visitor");
  } finally {
    await cleanup(visitor.id, conversation.id);
  }
});
