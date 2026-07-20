// ADMIN-01: requireOwner() is the shared, in-process check that admin
// Route Handlers and Server Components use to read the responder id off
// the verified owner session cookie. src/proxy.ts is the network-edge
// guard for /admin/* pages -- it runs the same verifySession call, but
// against NextRequest's own cookie jar rather than next/headers, so it
// cannot simply call this function; the two are kept in sync via the
// shared OWNER_COOKIE_NAME constant below.
import { cookies } from "next/headers";
import { verifySession, type OwnerSessionPayload } from "./session.ts";

export const OWNER_COOKIE_NAME = "owner_session";

/**
 * Resolves the current owner session, or null if there is no cookie, the
 * cookie fails verification, or it verifies but carries a non-owner `typ`
 * -- a visitor cookie must never grant admin access, even though both
 * cookie types share one signing secret.
 */
export async function requireOwner(): Promise<OwnerSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(OWNER_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const payload = await verifySession(token);
    if (payload.typ !== "owner") return null;
    return payload;
  } catch {
    // Invalid/expired/tampered token -- treated identically to no cookie.
    return null;
  }
}
