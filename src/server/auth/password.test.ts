import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "./password.ts";

test("password: hashPassword returns a non-plaintext hash with no bcrypt fingerprint", async () => {
  const plaintext = "correct horse battery staple";
  const hashed = await hashPassword(plaintext);
  assert.notEqual(hashed, plaintext);
  assert.ok(!hashed.toLowerCase().includes("bcrypt"));
  assert.ok(!hashed.startsWith("$2"));
});

test("password: verifyPassword resolves true for the correct password", async () => {
  const hashed = await hashPassword("secret1");
  assert.equal(await verifyPassword(hashed, "secret1"), true);
});

test("password: verifyPassword resolves false for the wrong password", async () => {
  const hashed = await hashPassword("secret1");
  assert.equal(await verifyPassword(hashed, "wrong"), false);
});
