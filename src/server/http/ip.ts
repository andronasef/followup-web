// T-01-25: caller-IP extraction and HMAC hashing, shared by every route
// that needs a per-caller rate-limit bucket key.
//
// The raw IP is NEVER passed to a log call, a DB column, or a pg_notify
// payload -- only its HMAC. An IP is personal data under this project's
// hard no-personal-data promise (ID-05), so it may exist only as a
// transient local and only ever leave this module hashed.
//
// Extracted verbatim (behavior-identical) out of
// src/app/api/chat/messages/send.ts, which re-exports both functions so
// its existing importers and tests are unaffected. The extraction exists
// because the ADMIN-01 login path needs the same primitives and must not
// import the visitor chat send module to get them (CR-03).
//
// `next/headers`-free by construction, so node:test can import it directly.
import { createHmac } from "node:crypto";

// Falls back to SESSION_SECRET (already required to be >=32 bytes, see
// session.ts) when a dedicated IP_HASH_SECRET isn't configured, so callers
// work without a second mandatory env var.
const IP_HASH_SECRET = process.env.IP_HASH_SECRET ?? process.env.SESSION_SECRET ?? "";

export function hashIp(ip: string): string {
  return createHmac("sha256", IP_HASH_SECRET).update(ip).digest("hex");
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
