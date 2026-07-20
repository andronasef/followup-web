// CHAT-03/CHAT-06/OPS-01: the durable, rate-limited visitor send path's
// actual behavior, deliberately kept in a module with NO import of
// next/headers (directly or transitively) -- route.ts is the only file
// that touches requireVisitor()/next-headers, so node:test can import this
// module directly. Plain Node's ESM resolver cannot resolve the bare
// "next/headers" specifier outside Next's own bundler (see 01-03-SUMMARY.md
// "Issues Encountered" for the same class of problem with extensionless
// imports); importing route.ts itself from a test would drag that in
// transitively via visitor.ts.
//
// Everything commits inside one Postgres transaction (insert + pg_notify)
// before a 200 is ever constructed -- there is no code path that reports
// success before the row is actually committed. Zero calls to any
// language-conversion/AI provider happen anywhere in this write path in
// Phase 1 -- see 01-RESEARCH.md's Anti-Patterns, "Blocking message
// durability on the OVH call".
import { createHmac } from "node:crypto";
import { z } from "zod";
import { sql as rawSql } from "drizzle-orm";
import { db } from "../../../../server/db/pool.ts";
import { create as createMessage, type Message } from "../../../../server/repo/messages.ts";
import { check as checkRateLimit } from "../../../../server/repo/ratelimit.ts";

// OPS-01's researcher-recommended shape (01-RESEARCH.md, "Claude's
// Discretion"): a generous burst absorbed instantly, sustained flooding
// throttled -- never a hard lockout. This route only ever returns a
// machine-readable reason code; the locked, gentle copy renders client-side
// (Plan 01-10).
export const RATE_LIMIT_CAPACITY = 20;
export const RATE_LIMIT_REFILL_RATE = 0.5; // tokens/sec

// Unicode-code-point-aware (not UTF-16 code units) -- so a message made of
// astral-plane characters (many emoji, some CJK extension characters) isn't
// truncated mid-character relative to a visitor's own sense of length.
export const MAX_MESSAGE_CODEPOINTS = 4000;

const bodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= MAX_MESSAGE_CODEPOINTS, {
      message: "message is too long",
    }),
  clientMsgId: z.string().min(1).optional(),
});

// T-01-25: HMAC-SHA256 the IP inline -- the raw IP variable is never passed
// to a log call, a DB column, or the pg_notify payload, only its hash.
// Falls back to SESSION_SECRET (already required to be >=32 bytes, see
// session.ts) when a dedicated IP_HASH_SECRET isn't configured, so this
// route works without a second mandatory env var -- see the plan's SUMMARY
// for the recommended dedicated rotating secret.
const IP_HASH_SECRET = process.env.IP_HASH_SECRET ?? process.env.SESSION_SECRET ?? "";

export function hashIp(ip: string): string {
  return createHmac("sha256", IP_HASH_SECRET).update(ip).digest("hex");
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export interface SendVisitorMessageInput {
  conversationId: number;
  visitorId: string;
  ip: string;
  rawBody: unknown;
}

export type SendVisitorMessageResult =
  | { status: 200; body: { id: number; createdAt: Message["createdAt"] } }
  | { status: 400; body: { error: string } }
  | { status: 429; body: { error: string } };

/**
 * Checks both the visitor-id and the HMAC'd-IP rate-limit buckets,
 * validates the body, then inserts + pg_notify's inside a single
 * transaction so the response is only ever 200 after a durable commit
 * (CHAT-06's must-have truth).
 */
export async function sendVisitorMessage(input: SendVisitorMessageInput): Promise<SendVisitorMessageResult> {
  const visitorLimit = await checkRateLimit(`v:${input.visitorId}`, RATE_LIMIT_CAPACITY, RATE_LIMIT_REFILL_RATE);
  const ipLimit = await checkRateLimit(`ip:${hashIp(input.ip)}`, RATE_LIMIT_CAPACITY, RATE_LIMIT_REFILL_RATE);
  if (!visitorLimit.allowed || !ipLimit.allowed) {
    // OPS-01 MUST NOT: no lockout/countdown copy here -- a machine-readable
    // reason code only.
    return { status: 429, body: { error: "rate_limited" } };
  }

  const parsed = bodySchema.safeParse(input.rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "invalid_body" } };
  }

  const created = await db.transaction(async (tx) => {
    const row = await createMessage(input.conversationId, "visitor", parsed.data.body, parsed.data.clientMsgId ?? null, tx);
    // T-01-24: pointers only -- {c, m, k} -- never the message body. Same
    // transaction as the insert above, so a client never sees a 200 for a
    // row that isn't durably committed yet.
    await tx.execute(
      rawSql`select pg_notify('chat', ${JSON.stringify({ c: input.conversationId, m: row.id, k: "message" })})`,
    );
    return row;
  });

  return { status: 200, body: { id: created.id, createdAt: created.createdAt } };
}
