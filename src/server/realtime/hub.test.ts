// Pure in-memory module -- no DB, no pool, so no after() teardown hook.
//
// NOTE: hub.ts pins its subscriber registries on globalThis (the Next
// standalone double-module-graph fix), so every test here must fully
// unsubscribe what it subscribes or it leaks into the next test.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as hub from "./hub.ts";

const CONVERSATION_ID = 987_654;

test("hub.subscribe: a published message event reaches the subscriber", () => {
  const seen: hub.HubEvent[] = [];
  const off = hub.subscribe(CONVERSATION_ID, (event) => seen.push(event));
  try {
    hub.publishChat(CONVERSATION_ID, 1);
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0], { type: "message", conversationId: CONVERSATION_ID, messageId: 1 });
  } finally {
    off();
  }
});

test("hub.subscribe: CR-06 calling the returned unsubscribe twice is a no-op the second time", () => {
  const seen: hub.HubEvent[] = [];
  const off = hub.subscribe(CONVERSATION_ID, (event) => seen.push(event));

  off();
  off(); // the stream's abort listener AND cancel() both call this handle

  hub.publishChat(CONVERSATION_ID, 1);
  assert.equal(seen.length, 0, "an unsubscribed subscriber must receive nothing");
});

test("hub.subscribe: CR-06 a late second unsubscribe from a torn-down stream must not deafen a reconnected one", () => {
  // A: the old stream. Its unsubscribe empties and removes the map entry.
  const seenA: hub.HubEvent[] = [];
  const offA = hub.subscribe(CONVERSATION_ID, (event) => seenA.push(event));
  offA();

  // B: the visitor's EventSource immediately reconnects, creating a BRAND
  // NEW Set under the same conversation id.
  const seenB: hub.HubEvent[] = [];
  const offB = hub.subscribe(CONVERSATION_ID, (event) => seenB.push(event));
  try {
    // A's second, late unsubscribe fires (abort listener after cancel()).
    offA();

    hub.publishChat(CONVERSATION_ID, 42);

    assert.equal(seenB.length, 1, "the reconnected stream must still receive live events");
    assert.deepEqual(seenB[0], { type: "message", conversationId: CONVERSATION_ID, messageId: 42 });
    assert.equal(seenA.length, 0);
  } finally {
    offB();
  }
});

test("hub.subscribeAll: CR-06 double-call idempotence on the admin firehose handle", () => {
  const seenA: hub.HubEvent[] = [];
  const offA = hub.subscribeAll((event) => seenA.push(event));
  offA();

  const seenB: hub.HubEvent[] = [];
  const offB = hub.subscribeAll((event) => seenB.push(event));
  try {
    offA(); // late second call from the torn-down owner stream

    hub.publishChat(CONVERSATION_ID, 7);

    assert.equal(seenB.length, 1, "the reconnected owner firehose must still receive events");
    assert.equal(seenA.length, 0);
  } finally {
    offB();
  }
});

test("hub.publishPresence: reaches both per-conversation and firehose subscribers", () => {
  const seenConv: hub.HubEvent[] = [];
  const seenAll: hub.HubEvent[] = [];
  const offConv = hub.subscribe(CONVERSATION_ID, (event) => seenConv.push(event));
  const offAll = hub.subscribeAll((event) => seenAll.push(event));
  try {
    hub.publishPresence({ isOwnerOnline: true });

    assert.deepEqual(seenConv, [{ type: "presence", payload: { isOwnerOnline: true } }]);
    assert.deepEqual(seenAll, [{ type: "presence", payload: { isOwnerOnline: true } }]);
  } finally {
    offConv();
    offAll();
  }
});
