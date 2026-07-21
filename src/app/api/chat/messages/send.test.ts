import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { sql } from "../../../../server/db/pool.ts";
import { getOrCreate as getOrCreateVisitor } from "../../../../server/repo/visitors.ts";
import { openFor } from "../../../../server/repo/conversations.ts";
import { RATE_LIMIT_CAPACITY, sendVisitorMessage } from "./send.ts";

// Mirrors route.ts's own hashIp() fallback exactly, so the test can clean up
// the same rate_limit_buckets row the route wrote to.
function ipBucketKey(ip: string): string {
  const secret = process.env.IP_HASH_SECRET ?? process.env.SESSION_SECRET ?? "";
  return `ip:${createHmac("sha256", secret).update(ip).digest("hex")}`;
}

// node:test runs each file in its own process; without closing the pool the
// process never exits (open sockets keep the event loop alive) and the
// whole `node --test` run hangs waiting on this file's child process.
after(async () => {
  await sql.end({ timeout: 5 });
});

async function freshConversation() {
  const visitor = await getOrCreateVisitor();
  const conversation = await openFor(visitor.id);
  return { visitor, conversation };
}

async function cleanup(conversationId: number, visitorId: string, extraKeys: string[] = []) {
  await sql`delete from messages where conversation_id = ${conversationId}`;
  await sql`delete from conversations where id = ${conversationId}`;
  await sql`delete from visitors where id = ${visitorId}`;
  await sql`delete from rate_limit_buckets where key = ${`v:${visitorId}`}`;
  for (const key of extraKeys) {
    await sql`delete from rate_limit_buckets where key = ${key}`;
  }
}

test("sendVisitorMessage: a valid, non-empty body persists a row and the result carries id + createdAt", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const result = await sendVisitorMessage({
      conversationId: conversation.id,
      visitorId: visitor.id,
      ip: randomUUID(),
      rawBody: { body: "Hello, is anyone there?" },
    });

    assert.equal(result.status, 200);
    assert.ok("id" in result.body && typeof result.body.id === "number");
    assert.ok("createdAt" in result.body && result.body.createdAt != null);

    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count from messages where conversation_id = ${conversation.id}
    `;
    assert.equal(rows[0]!.count, 1, "exactly one row must be persisted");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("sendVisitorMessage: an empty-string or whitespace-only body returns 400 and creates zero rows", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const empty = await sendVisitorMessage({
      conversationId: conversation.id,
      visitorId: visitor.id,
      ip: randomUUID(),
      rawBody: { body: "" },
    });
    const whitespace = await sendVisitorMessage({
      conversationId: conversation.id,
      visitorId: visitor.id,
      ip: randomUUID(),
      rawBody: { body: "   \n\t  " },
    });

    assert.equal(empty.status, 400);
    assert.equal(whitespace.status, 400);

    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count from messages where conversation_id = ${conversation.id}
    `;
    assert.equal(rows[0]!.count, 0, "an empty/whitespace-only body must never be persisted");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("sendVisitorMessage: two sends with the identical clientMsgId result in exactly one persisted row", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const clientMsgId = randomUUID();
    const ip = randomUUID();

    const first = await sendVisitorMessage({
      conversationId: conversation.id,
      visitorId: visitor.id,
      ip,
      rawBody: { body: "retry me", clientMsgId },
    });
    const second = await sendVisitorMessage({
      conversationId: conversation.id,
      visitorId: visitor.id,
      ip,
      rawBody: { body: "retry me (retried)", clientMsgId },
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.ok("id" in first.body && "id" in second.body);
    assert.equal((first.body as { id: number }).id, (second.body as { id: number }).id);

    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count from messages where conversation_id = ${conversation.id}
    `;
    assert.equal(rows[0]!.count, 1, "an idempotent retry must not insert a second row");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

test("sendVisitorMessage: a burst of exactly capacity succeeds, the very next send is rate-limited with no lockout copy", async () => {
  const { visitor, conversation } = await freshConversation();
  const ip = randomUUID();
  try {
    for (let i = 0; i < RATE_LIMIT_CAPACITY; i++) {
      const result = await sendVisitorMessage({
        conversationId: conversation.id,
        visitorId: visitor.id,
        ip,
        rawBody: { body: `message ${i}` },
      });
      assert.equal(result.status, 200, `message ${i + 1} of ${RATE_LIMIT_CAPACITY} should succeed`);
    }

    const overflow = await sendVisitorMessage({
      conversationId: conversation.id,
      visitorId: visitor.id,
      ip,
      rawBody: { body: "one too many" },
    });
    assert.equal(overflow.status, 429, "the call immediately after a full burst must be rate-limited");
    assert.notEqual(overflow.status, 500, "a rate limit must never surface as a server error");

    const copy = JSON.stringify(overflow.body).toLowerCase();
    for (const forbidden of ["wait", "blocked", "locked", "queue", "try again in"]) {
      assert.ok(!copy.includes(forbidden), `rate-limited response body must carry no lockout/countdown copy, saw "${forbidden}"`);
    }
  } finally {
    await cleanup(conversation.id, visitor.id, [ipBucketKey(ip)]);
  }
});

test("sendVisitorMessage: does not import the openai package or reference translation/OVH", async () => {
  const sendSource = await readFile(new URL("./send.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sendSource, /openai/i);
  assert.doesNotMatch(sendSource, /translat/i);
});

test("sendVisitorMessage: a valid send's 200 result includes messageBody (the just-persisted body) alongside id/createdAt", async () => {
  const { visitor, conversation } = await freshConversation();
  try {
    const result = await sendVisitorMessage({
      conversationId: conversation.id,
      visitorId: visitor.id,
      ip: randomUUID(),
      rawBody: { body: "Hello, is anyone there?" },
    });

    assert.equal(result.status, 200);
    assert.ok("messageBody" in result.body && typeof result.body.messageBody === "string");
    assert.equal((result.body as { messageBody: string }).messageBody, "Hello, is anyone there?");
  } finally {
    await cleanup(conversation.id, visitor.id);
  }
});

// route.ts imports next/headers (via requireVisitor) transitively, so it
// cannot be imported directly by node:test outside Next's bundler -- see
// send.ts's own header comment for the same class of constraint. Its
// after()-triggered translation call is instead verified by source
// inspection (an allowed fallback per this plan's own acceptance criteria).
test("route.ts: schedules the visitor->owner translation trigger via after(), never inside send.ts", async () => {
  const routeSource = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  const sendSource = await readFile(new URL("./send.ts", import.meta.url), "utf8");

  const afterCallsInRoute = (routeSource.match(/after\(/g) ?? []).length;
  const afterCallsInSend = (sendSource.match(/after\(/g) ?? []).length;
  assert.ok(afterCallsInRoute >= 1, "route.ts must call after() at least once");
  assert.equal(afterCallsInSend, 0, "send.ts must never call after() -- it has no request scope");
});

test("route.ts: guards the translation trigger on session.lang !== OWNER_LANG so a same-language visitor triggers zero calls", async () => {
  const routeSource = await readFile(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(
    routeSource,
    /session\.lang\s*!==\s*OWNER_LANG/,
    "route.ts must guard the translation trigger on session.lang !== OWNER_LANG",
  );
});
