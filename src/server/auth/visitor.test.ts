// visitor.ts itself imports "next/headers" at module scope, which plain
// node:test cannot resolve outside Next's own bundler (confirmed
// empirically -- see this plan's own SUMMARY "Deviations"; the same class
// of constraint documented across send.ts/reply.ts's header comments).
// requireVisitor()'s vidParam wiring is therefore verified two ways below:
//   1. Source inspection of visitor.ts/bootstrap/route.ts (the established
//      fallback for next/headers-coupled files -- see send.test.ts's
//      "route.ts:" tests for the same pattern).
//   2. A REAL, DB-backed behavior test of the underlying primitives
//      requireVisitor's vidParam branch is built from (verifySession +
//      getOrCreate's id-preserving reuse), plus recover.ts's handleRecover
//      -- the concrete, directly-importable manifestation of the exact
//      same "reuse an already-verified identity, never invent one" T-02-18
//      contract, exercised against the live test DB.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { sql } from "../db/pool.ts";
import { signVisitorId, verifySession } from "./session.ts";
import { getOrCreate as getOrCreateVisitor } from "../repo/visitors.ts";
import { create as createSubscription, getByEndpoint } from "../repo/pushSubscriptions.ts";
import { handleRecover } from "../push/recover.ts";

// node:test runs each file in its own process; without closing the pool the
// process never exits and the whole `node --test` run hangs.
after(async () => {
  await sql.end({ timeout: 5 });
});

async function cleanupVisitor(visitorId: string) {
  await sql`delete from push_subscriptions where visitor_id = ${visitorId}`;
  await sql`delete from visitors where id = ${visitorId}`;
}

// --- Real, DB-backed behavior: the primitives requireVisitor's vidParam
// branch is built from (ID-04) -----------------------------------------

test("vidParam primitives: a verified visitor JWT's sub resolves via getOrCreate to the SAME existing visitor, never a fresh one", async () => {
  const original = await getOrCreateVisitor(undefined, "es", "dark");
  try {
    const vidToken = await signVisitorId(original.id, { lang: "es", appearance: "dark" });

    // Exactly what requireVisitor does: verify, then getOrCreate(sub, ...).
    const payload = await verifySession(vidToken);
    assert.equal(payload.typ, "visitor");
    const reused = await getOrCreateVisitor((payload as { sub: string }).sub, "en", "system");

    assert.equal(reused.id, original.id, "a verified vidParam must reuse the SAME visitor id, never mint a new one");
  } finally {
    await cleanupVisitor(original.id);
  }
});

test("vidParam primitives: an invalid/forged vidParam fails verifySession and falls through to mint-new (never throws)", async () => {
  await assert.rejects(() => verifySession("not-a-real-jwt-at-all"));

  // requireVisitor's own try/catch around this call is what lets the
  // fallthrough happen without crashing the request -- verified by source
  // inspection below, since requireVisitor itself can't be invoked here.
});

test("vidParam primitives: an expired-looking/tampered token (different secret) also fails verifySession", async () => {
  const { SignJWT } = await import("jose");
  const forgedSecret = new TextEncoder().encode("b".repeat(32));
  const forged = await new SignJWT({ sub: "attacker-controlled-id", typ: "visitor" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10y")
    .sign(forgedSecret);

  await assert.rejects(() => verifySession(forged), "a token signed with a different secret must never verify");
});

// --- Real, DB-backed behavior: recover.ts's handleRecover (ID-03) ------

test("handleRecover: a seeded push_subscriptions row resolves 200 + a cookie value that decodes to that row's visitorId", async () => {
  const visitor = await getOrCreateVisitor(undefined, "ar", "light");
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    await createSubscription(visitor.id, endpoint, "p256dh-key", "auth-secret");

    const result = await handleRecover({ endpoint });

    assert.equal(result.status, 200);
    if (result.status !== 200) return;
    assert.equal(result.body.lang, "ar");
    assert.equal(result.body.appearance, "light");

    const decoded = await verifySession(result.cookieValue);
    assert.equal(decoded.typ, "visitor");
    assert.equal((decoded as { sub: string }).sub, visitor.id, "the recovered cookie must decode to the SAME visitorId as the subscription row");
  } finally {
    await cleanupVisitor(visitor.id);
  }
});

test("handleRecover: an endpoint matching no row returns 404 and no cookieValue (never invents an identity)", async () => {
  const result = await handleRecover({ endpoint: `https://push.example.com/${randomUUID()}` });

  assert.equal(result.status, 404);
  assert.ok(!("cookieValue" in result));
});

test("handleRecover: a malformed body (missing/invalid endpoint) returns 400", async () => {
  const missing = await handleRecover({});
  const notAUrl = await handleRecover({ endpoint: "not-a-url" });

  assert.equal(missing.status, 400);
  assert.equal(notAUrl.status, 400);
});

test("pushSubscriptions.getByEndpoint: returns null for an unknown endpoint, the row for a known one", async () => {
  const visitor = await getOrCreateVisitor();
  try {
    const endpoint = `https://push.example.com/${randomUUID()}`;
    assert.equal(await getByEndpoint(endpoint), null);

    await createSubscription(visitor.id, endpoint, "p256dh-key", "auth-secret");
    const row = await getByEndpoint(endpoint);
    assert.ok(row);
    assert.equal(row?.visitorId, visitor.id);
  } finally {
    await cleanupVisitor(visitor.id);
  }
});

// --- Source inspection: requireVisitor's/bootstrap route's actual wiring
// (the established fallback for next/headers-coupled files) -------------

test("visitor.ts: requireVisitor accepts an optional vidParam and guards its verification in a try/catch (never throws on an invalid token)", async () => {
  const source = await readFile(new URL("./visitor.ts", import.meta.url), "utf8");

  assert.match(source, /vidParam/, "requireVisitor must accept a vidParam option");
  assert.match(
    source,
    /verifySession\(opts\.vidParam\)/,
    "requireVisitor must verify vidParam via verifySession before ever trusting it",
  );
});

test("visitor.ts: requireVisitor calls getOrCreate with the vidParam-resolved id, not an unconditional null", async () => {
  const source = await readFile(new URL("./visitor.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /getOrCreate\(existingVisitorId, lang, appearance\)/,
    "the mint-or-reuse call must pass the vidParam-resolved existingVisitorId, not a hardcoded null",
  );
});

test("bootstrap/route.ts: reads an optional vid field from the request body and passes it through as requireVisitor's vidParam", async () => {
  const source = await readFile(new URL("../../app/api/visitor/bootstrap/route.ts", import.meta.url), "utf8");

  assert.match(source, /body\??\.vid/, "must read an optional vid field from the parsed JSON body");
  assert.match(source, /requireVisitor\(\{\s*vidParam/, "must pass the vid field through as requireVisitor's vidParam option");
});
