// Pure crypto/header parsing -- no DB, so no pool teardown hook.
import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIp, hashIp } from "./ip.ts";

function requestWith(headers: Record<string, string>): Request {
  return new Request("https://example.com/", { headers });
}

test("clientIp: takes the FIRST entry of x-forwarded-for, trimmed", () => {
  assert.equal(clientIp(requestWith({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" })), "203.0.113.7");
  assert.equal(clientIp(requestWith({ "x-forwarded-for": "  203.0.113.7  " })), "203.0.113.7");
});

test("clientIp: falls back to x-real-ip, then to the 'unknown' sentinel", () => {
  assert.equal(clientIp(requestWith({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
  assert.equal(clientIp(requestWith({})), "unknown");
});

test("clientIp: x-forwarded-for wins over x-real-ip when both are present", () => {
  assert.equal(clientIp(requestWith({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "203.0.113.9" })), "203.0.113.7");
});

test("hashIp: T-01-25 the output is a stable hex digest that never contains the raw IP", () => {
  const ip = "203.0.113.7";
  const digest = hashIp(ip);

  assert.match(digest, /^[0-9a-f]{64}$/, "must be a hex SHA-256 digest");
  assert.ok(!digest.includes(ip), "the raw IP must never appear in the value that leaves this module");
  assert.equal(digest, hashIp(ip), "must be stable, so it can key a rate-limit bucket");
});

test("hashIp: different IPs produce different bucket keys", () => {
  assert.notEqual(hashIp("203.0.113.7"), hashIp("203.0.113.8"));
});

test("send.ts still re-exports clientIp/hashIp, so its existing importers are unaffected", async () => {
  const send = await import("../../app/api/chat/messages/send.ts");
  assert.equal(send.hashIp("203.0.113.7"), hashIp("203.0.113.7"));
  assert.equal(send.clientIp(requestWith({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
});
