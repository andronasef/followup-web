import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "../../../../server/db/pool.ts";
import { hashPassword } from "../../../../server/auth/password.ts";
import { createResponder } from "../../../../server/repo/responders.ts";
import { verifySession } from "../../../../server/auth/session.ts";
import { hashIp } from "../../../../server/http/ip.ts";
import { handleAdminLogin, LOGIN_RATE_LIMIT_CAPACITY } from "./login.ts";

// node:test runs each file in its own process; without closing the pool the
// process never exits.
after(async () => {
  await sql.end({ timeout: 5 });
});

const PASSWORD = "correct-horse-battery-staple";

/** A distinct IP per test, so one test's exhausted bucket never leaks into
 * the next (the buckets are real rows in a shared DB). */
function freshIp(): string {
  return `ip-${randomUUID()}`;
}

async function makeOwner() {
  const email = `owner-${randomUUID()}@example.com`;
  const responder = await createResponder({ email, passwordHash: await hashPassword(PASSWORD) });
  return { email, responder };
}

async function cleanupOwner(id: number) {
  await sql`delete from responders where id = ${id}`;
}

async function cleanupBuckets(ip: string) {
  await sql`delete from rate_limit_buckets where key = ${`admin-login:${hashIp(ip)}`}`;
}

test("handleAdminLogin: a fresh bucket + correct credentials returns 200 and a signed owner-session cookie value", async () => {
  const { email, responder } = await makeOwner();
  try {
    const result = await handleAdminLogin({ ip: freshIp(), rawBody: { email, password: PASSWORD } });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true });
    const cookieValue = (result as { cookieValue: string }).cookieValue;
    assert.equal(typeof cookieValue, "string");

    const session = await verifySession(cookieValue);
    assert.equal(session.typ, "owner", "the cookie value must verify as a real owner session");
    assert.equal(String(session.sub), String(responder.id));
  } finally {
    await cleanupOwner(responder.id);
  }
});

test("handleAdminLogin: ADMIN-01 a wrong password and an unknown email return the IDENTICAL 401 body", async () => {
  const { email, responder } = await makeOwner();
  try {
    const wrongPassword = await handleAdminLogin({ ip: freshIp(), rawBody: { email, password: "wrong" } });
    const unknownEmail = await handleAdminLogin({
      ip: freshIp(),
      rawBody: { email: `nobody-${randomUUID()}@example.com`, password: PASSWORD },
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(
      wrongPassword.body,
      unknownEmail.body,
      "no branch may reveal which half of the credential pair was wrong",
    );
  } finally {
    await cleanupOwner(responder.id);
  }
});

test("handleAdminLogin: CR-03 once the IP bucket is exhausted, returns 429 even for CORRECT credentials -- the check precedes the credential path", async () => {
  const { email, responder } = await makeOwner();
  const ip = freshIp();
  try {
    // Burn the whole burst. Wrong password each time, so nothing succeeds
    // and the 401 path is what fills the bucket -- exactly the brute-force
    // shape the throttle exists for.
    let allowedDurationMs = 0;
    for (let i = 0; i < LOGIN_RATE_LIMIT_CAPACITY; i++) {
      const started = performance.now();
      const result = await handleAdminLogin({ ip, rawBody: { email, password: "wrong" } });
      allowedDurationMs = performance.now() - started;
      assert.equal(result.status, 401, `attempt ${i + 1} should still be allowed through to a 401`);
    }

    // Correct credentials, exhausted bucket. A 429 here is only possible if
    // the throttle runs BEFORE the responder lookup and the verify -- had it
    // run after, this would be a 200.
    const started = performance.now();
    const throttled = await handleAdminLogin({ ip, rawBody: { email, password: PASSWORD } });
    const throttledDurationMs = performance.now() - started;

    assert.equal(throttled.status, 429);
    assert.equal((throttled as { cookieValue?: string }).cookieValue, undefined, "no session may be minted");

    // And it must be CHEAP. Argon2id at memoryCost 19456 / timeCost 2 is
    // deliberately expensive; pinning the single replica's CPU with
    // back-to-back verifies is the DoS this bounds, so the refused path
    // must not pay that cost.
    assert.ok(
      throttledDurationMs < allowedDurationMs / 2,
      `the 429 path must skip the Argon2id verify (429 took ${throttledDurationMs.toFixed(1)}ms vs an allowed ${allowedDurationMs.toFixed(1)}ms)`,
    );
  } finally {
    await cleanupOwner(responder.id);
    await cleanupBuckets(ip);
  }
});

test("handleAdminLogin: CR-03/T-0vf-04 the 429 body is generic and reveals nothing about account existence", async () => {
  const ip = freshIp();
  const unknownEmail = `nobody-${randomUUID()}@example.com`;
  const { email, responder } = await makeOwner();
  try {
    for (let i = 0; i < LOGIN_RATE_LIMIT_CAPACITY; i++) {
      await handleAdminLogin({ ip, rawBody: { email: unknownEmail, password: "wrong" } });
    }

    const forUnknown = await handleAdminLogin({ ip, rawBody: { email: unknownEmail, password: "wrong" } });
    const forReal = await handleAdminLogin({ ip, rawBody: { email, password: PASSWORD } });

    assert.equal(forUnknown.status, 429);
    assert.equal(forReal.status, 429, "the bucket is keyed on the IP alone, so a real email is throttled identically");
    assert.deepEqual(forUnknown.body, forReal.body, "the 429 must not become an account-existence oracle");
    assert.ok(!JSON.stringify(forUnknown.body).includes(unknownEmail), "the body must not echo the attempted email");
  } finally {
    await cleanupOwner(responder.id);
    await cleanupBuckets(ip);
  }
});

test("handleAdminLogin: CR-03 the bucket is keyed on the hashed IP only -- a storm from one IP never locks the owner out from another", async () => {
  const { email, responder } = await makeOwner();
  const attackerIp = freshIp();
  const ownerIp = freshIp();
  try {
    for (let i = 0; i <= LOGIN_RATE_LIMIT_CAPACITY; i++) {
      await handleAdminLogin({ ip: attackerIp, rawBody: { email, password: "wrong" } });
    }
    assert.equal(
      (await handleAdminLogin({ ip: attackerIp, rawBody: { email, password: PASSWORD } })).status,
      429,
      "the attacker's own IP must be throttled",
    );

    const ownerResult = await handleAdminLogin({ ip: ownerIp, rawBody: { email, password: PASSWORD } });
    assert.equal(ownerResult.status, 200, "the owner must still be able to log in from a different IP");
  } finally {
    await cleanupOwner(responder.id);
    await cleanupBuckets(attackerIp);
    await cleanupBuckets(ownerIp);
  }
});

test("handleAdminLogin: a malformed body converges on the same 401 as bad credentials", async () => {
  const result = await handleAdminLogin({ ip: freshIp(), rawBody: { email: "not-an-email" } });
  assert.equal(result.status, 401);
});
