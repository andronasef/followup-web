// Not in 01-06-PLAN.md's files_modified list -- added per the plan's own
// Task 1 instruction ("issuance of a brand-new cookie happens via a tiny
// Route Handler ... invoked from the root layout on first paint").
// requireVisitor() cannot call cookies().set() from layout.tsx's Server
// Component render (Next.js throws), so this is the one real issuance
// path for a brand-new visitor. Called by src/app/pre-paint.ts on first
// paint whenever the server-rendered <html> shows no cookie was present.
import { requireVisitor } from "../../../../server/auth/visitor.ts";

// force-dynamic: this must run per-request, never be treated as ISR/cached
// -- an anonymous-visitor bootstrap response is never shareable.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  // ID-04: an optional `vid` field lets pre-paint.ts's URL-carried token
  // (?vid=, read from location.search) recover an existing visitor
  // identity in a fresh, cookie-less storage context (the iOS Home Screen
  // relaunch case) -- see visitor.ts's requireVisitor({vidParam}).
  const body = await request.json().catch(() => ({}) as { vid?: unknown });
  const vidParam = typeof body?.vid === "string" && body.vid.length > 0 ? body.vid : undefined;

  const session = await requireVisitor({ vidParam });
  return Response.json({
    visitorId: session.visitorId,
    lang: session.lang,
    appearance: session.appearance,
  });
}
