// V3 Session Management (01-RESEARCH.md Security Domain) — one shared jose
// HS256 instance signs and verifies BOTH the visitor-identity cookie and the
// owner-session cookie. The two are distinguished only by the `typ` claim
// ('visitor' | 'owner'), never by separate signing keys. There is no
// database-backed revocation here: JWT `exp` is the sole revocation
// mechanism in Phase 1 (OPS-05 lockout/revocation hardening is Phase 3).
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const secretEnv = process.env.SESSION_SECRET;
if (!secretEnv || secretEnv.length < 32) {
  // A weak or missing secret defeats the whole session model, so this fails
  // loudly at import time rather than silently signing with something weak.
  throw new Error("SESSION_SECRET must be set and at least 32 characters long");
}
const secret = new TextEncoder().encode(secretEnv);

export type VisitorSessionPayload = JWTPayload & {
  sub: string;
  typ: "visitor";
  lang?: string;
  appearance?: string;
};

export type OwnerSessionPayload = JWTPayload & {
  sub: string;
  typ: "owner";
};

export type SessionPayload = VisitorSessionPayload | OwnerSessionPayload;

export async function signVisitorId(
  visitorId: string,
  extra?: { lang?: string; appearance?: string },
): Promise<string> {
  return new SignJWT({
    sub: visitorId,
    typ: "visitor",
    lang: extra?.lang,
    appearance: extra?.appearance,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10y")
    .sign(secret);
}

export async function signOwnerSession(responderId: number | string): Promise<string> {
  return new SignJWT({ sub: String(responderId), typ: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as SessionPayload;
}
