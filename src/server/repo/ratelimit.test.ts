import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { sql } from "../db/pool.ts";
import { check } from "./ratelimit.ts";

async function cleanup(key: string) {
  await sql`delete from rate_limit_buckets where key = ${key}`;
}

test("ratelimit.check: a brand-new key is created and charged atomically on its first call", async () => {
  const key = `v:test-${randomUUID()}`;
  try {
    const result = await check(key, 20, 0.5);
    assert.equal(result.allowed, true);
    assert.ok(
      result.allowed && result.remaining >= 18.9 && result.remaining < 19.1,
      `expected remaining close to 19 on a brand-new key, got ${JSON.stringify(result)}`,
    );
  } finally {
    await cleanup(key);
  }
});

test("ratelimit.check: a burst of exactly capacity succeeds instantly, the next call is rate-limited", async () => {
  const key = `v:test-${randomUUID()}`;
  const capacity = 20;
  try {
    for (let i = 0; i < capacity; i++) {
      const result = await check(key, capacity, 0.5);
      assert.equal(result.allowed, true, `call ${i + 1} of ${capacity} should succeed`);
    }

    const overflow = await check(key, capacity, 0.5);
    assert.equal(overflow.allowed, false, "the call immediately after a full burst must be rate-limited");
  } finally {
    await cleanup(key);
  }
});
