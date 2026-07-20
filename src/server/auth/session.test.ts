import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { signOwnerSession, signVisitorId, verifySession } from "./session.ts";

test("session: signVisitorId + verifySession round-trips sub and typ: 'visitor'", async () => {
  const token = await signVisitorId("abc-123");
  const payload = await verifySession(token);
  assert.equal(payload.sub, "abc-123");
  assert.equal(payload.typ, "visitor");
});

test("session: signOwnerSession + verifySession round-trips sub and typ: 'owner'", async () => {
  const token = await signOwnerSession(42);
  const payload = await verifySession(token);
  assert.equal(payload.sub, "42");
  assert.equal(payload.typ, "owner");
});

test("session: verifySession rejects a token signed with a different secret (tampered/forged)", async () => {
  const forgedSecret = new TextEncoder().encode("a".repeat(32));
  const forged = await new SignJWT({ sub: "attacker", typ: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(forgedSecret);

  await assert.rejects(() => verifySession(forged));
});

test("session: typ round-trips faithfully so callers can branch on visitor vs owner", async () => {
  const visitorToken = await signVisitorId("visitor-1");
  const visitorPayload = await verifySession(visitorToken);
  assert.equal(visitorPayload.typ, "visitor");
  assert.notEqual(visitorPayload.typ, "owner");

  const ownerToken = await signOwnerSession(7);
  const ownerPayload = await verifySession(ownerToken);
  assert.equal(ownerPayload.typ, "owner");
  assert.notEqual(ownerPayload.typ, "visitor");
});
