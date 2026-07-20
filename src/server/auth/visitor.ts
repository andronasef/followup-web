// ID-01/CHAT-08: the visitor identity substrate every later visitor-facing
// route/component depends on. See .planning/phases/01-foundation-and-the-
// realtime-spine/01-CONTEXT.md D-11 -- the cookie is the single source of
// truth for identity; localStorage is a display/recovery mirror only.
import { cookies, headers } from "next/headers";
import { signVisitorId, verifySession } from "./session.ts";
import { getOrCreate } from "../repo/visitors.ts";
import { openFor, type Conversation } from "../repo/conversations.ts";
import { detectLanguage } from "../i18n/detect.ts";

export const VISITOR_COOKIE_NAME = "visitor";

export const VISITOR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  // Matches session.ts's signVisitorId 10-year JWT expiration -- the
  // cookie itself must outlive the token or the browser evicts it first.
  maxAge: 60 * 60 * 24 * 365 * 10,
};

export interface VisitorSession {
  visitorId: string | null;
  lang: string;
  appearance: string;
  conversation: Conversation | null;
  isNewCookie: boolean;
}

/**
 * Resolves the current visitor's identity + open conversation (CHAT-08).
 *
 * `cookies().set()` is only legal inside a Server Action or Route Handler
 * -- a React Server Component render (layout.tsx, page.tsx) throws if you
 * try. Pass `allowCookieWrite: false` from a Server Component so a
 * missing/invalid cookie never triggers a DB write there either --
 * otherwise every no-cookie page render (bots, crawlers, retries before
 * the client bootstrap completes) would mint an orphaned visitor +
 * conversation row that can never be reached again.
 *
 * The one real issuance path is a Route Handler:
 * src/app/api/visitor/bootstrap/route.ts, invoked client-side on first
 * paint (src/app/pre-paint.ts) for a brand-new visitor, and
 * src/app/api/chat/prefs/route.ts's PATCH, which re-signs an existing
 * one. Both call this function with the default `allowCookieWrite: true`.
 */
export async function requireVisitor(
  opts: { allowCookieWrite?: boolean } = {},
): Promise<VisitorSession> {
  const allowCookieWrite = opts.allowCookieWrite ?? true;
  const cookieStore = await cookies();
  const token = cookieStore.get(VISITOR_COOKIE_NAME)?.value;

  if (token) {
    try {
      const payload = await verifySession(token);
      if (payload.typ === "visitor") {
        const conversation = await openFor(payload.sub);
        return {
          visitorId: payload.sub,
          lang: payload.lang ?? "en",
          appearance: payload.appearance ?? "system",
          conversation,
          isNewCookie: false,
        };
      }
    } catch {
      // Invalid/expired/tampered token -- treated identically to no
      // cookie at all; falls through to issuance below.
    }
  }

  const headerStore = await headers();
  const lang = detectLanguage(headerStore.get("accept-language"));
  const appearance = "system";

  if (!allowCookieWrite) {
    // Server Component render path: safe render-time defaults, no DB
    // write. The client-side bootstrap fetch (pre-paint.ts) is what
    // actually creates the visitor once it's legal to persist a cookie.
    return { visitorId: null, lang, appearance, conversation: null, isNewCookie: true };
  }

  const visitor = await getOrCreate(null, lang, appearance);
  const conversation = await openFor(visitor.id);
  const signed = await signVisitorId(visitor.id, { lang, appearance });

  try {
    cookieStore.set(VISITOR_COOKIE_NAME, signed, VISITOR_COOKIE_OPTIONS);
  } catch {
    // Defensive only -- allowCookieWrite:true is only ever passed from a
    // Route Handler/Server Action, where this never throws.
  }

  return { visitorId: visitor.id, lang, appearance, conversation, isNewCookie: true };
}
