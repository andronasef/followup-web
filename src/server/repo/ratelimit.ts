// OPS-01: race-free Postgres token-bucket check (01-RESEARCH.md Pattern 7)
// -- a single INSERT ... ON CONFLICT ... WHERE statement, no
// SELECT-then-UPDATE round trip, race-free under Postgres row-level
// locking. An empty result set means rate-limited; a returned row means
// allowed.
//
// MUST NOT express a hard-cutoff/lockout -- capacity/refillRate must stay a
// generous burst allowance (the caller's job to tune, ~20 tokens / ~1 per
// 2s per the locked OPS-01 recommendation) so a visitor typing urgently in
// crisis is never stonewalled.
import { sql } from "../db/pool.ts";

export type RateLimitResult = { allowed: true; remaining: number } | { allowed: false; remaining: 0 };

export async function check(key: string, capacity: number, refillRate: number): Promise<RateLimitResult> {
  const rows = await sql<{ tokens: number }[]>`
    insert into rate_limit_buckets (key, tokens, updated_at)
    values (${key}, ${capacity} - 1, now())
    on conflict (key) do update set
      tokens = least(${capacity}, rate_limit_buckets.tokens
                       + extract(epoch from (now() - rate_limit_buckets.updated_at)) * ${refillRate}) - 1,
      updated_at = now()
    where rate_limit_buckets.tokens
          + extract(epoch from (now() - rate_limit_buckets.updated_at)) * ${refillRate} >= 1
    returning tokens
  `;

  const [row] = rows;
  if (!row) return { allowed: false, remaining: 0 };
  return { allowed: true, remaining: row.tokens };
}
