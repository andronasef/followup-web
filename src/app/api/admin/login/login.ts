// ADMIN-01: non-enumerating owner login. Whether the email lookup misses
// or the password verification fails, both paths converge on the exact
// same response, constructed in exactly one place -- no branch reveals
// which half was wrong. verifyPassword still runs against a real
// (precomputed, module-scope) Argon2id hash even on an email miss, so a
// timing side-channel cannot distinguish "no such email" from "wrong
// password" by response latency.
//
// `next/headers`-free, mirroring recover.ts/send.ts/reply.ts's split --
// route.ts is the only file that touches cookies()/next-headers, so
// node:test can import this module's behavior directly.
import { z } from "zod";
import { findByEmail } from "../../../../server/repo/responders.ts";
import { hashPassword, verifyPassword } from "../../../../server/auth/password.ts";
import { signOwnerSession } from "../../../../server/auth/session.ts";
import { check as checkRateLimit } from "../../../../server/repo/ratelimit.ts";
import { hashIp } from "../../../../server/http/ip.ts";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// CR-03. Sized for a single human owner typing a password on a phone: a
// ten-attempt burst absorbed instantly, then roughly one further attempt
// every ten seconds. Strict enough to make offline-speed credential
// stuffing pointless and to stop an attacker pinning the single replica's
// CPU with back-to-back Argon2id verifies (each is deliberately expensive
// -- that cost is the DoS vector), non-punitive enough that a genuinely
// fumbling owner is never locked out for a meaningful length of time.
export const LOGIN_RATE_LIMIT_CAPACITY = 10;
export const LOGIN_RATE_LIMIT_REFILL_RATE = 0.1; // tokens/sec -- 1 per 10s

// A real Argon2id hash of a password nobody will ever type, computed once
// at module load. Verified against on an email miss so the verify() call
// always runs with the same algorithm/cost parameters regardless of
// whether the account exists -- constant-shape timing.
const DUMMY_HASH = hashPassword("no-account-will-ever-have-this-password");

const INVALID_CREDENTIALS = { error: "That email or password isn't right." } as const;

export interface HandleAdminLoginInput {
  /** The caller's raw IP. Hashed immediately; never logged or stored. */
  ip: string;
  rawBody: unknown;
}

export type HandleAdminLoginResult =
  // `cookieValue` is the already-signed owner-session JWT the caller
  // (route.ts) sets as the cookie -- kept out of `body` so this module
  // never has to touch cookies()/next-headers itself. Same result shape as
  // src/server/push/recover.ts.
  | { status: 200; body: { ok: true }; cookieValue: string }
  | { status: 401; body: { error: string } }
  | { status: 429; body: { error: string } };

export async function handleAdminLogin(input: HandleAdminLoginInput): Promise<HandleAdminLoginResult> {
  // CR-03: the FIRST action, before the responder lookup and before any
  // verifyPassword call. Ordering is the whole point -- a throttle that
  // runs after the Argon2id verify does not bound the CPU cost it exists
  // to bound.
  //
  // Keyed on the HASHED IP ONLY, never on the email. A per-email bucket
  // would let any attacker lock the single owner out of their own account
  // from a different IP, and it would turn the 429 into an
  // account-existence oracle -- undoing the non-enumerating 401
  // convergence below. As keyed here, the 429 is a pure function of the
  // caller's own request rate and reveals nothing about any account.
  const limit = await checkRateLimit(
    `admin-login:${hashIp(input.ip)}`,
    LOGIN_RATE_LIMIT_CAPACITY,
    LOGIN_RATE_LIMIT_REFILL_RATE,
  );
  if (!limit.allowed) {
    return { status: 429, body: { error: "Too many attempts. Please wait a moment and try again." } };
  }

  const parsed = loginSchema.safeParse(input.rawBody);
  if (!parsed.success) return { status: 401, body: INVALID_CREDENTIALS };

  const responder = await findByEmail(parsed.data.email);
  const ok = await verifyPassword(responder?.passwordHash ?? (await DUMMY_HASH), parsed.data.password).catch(
    () => false,
  );

  if (!responder || !ok) return { status: 401, body: INVALID_CREDENTIALS };

  return { status: 200, body: { ok: true }, cookieValue: await signOwnerSession(responder.id) };
}
