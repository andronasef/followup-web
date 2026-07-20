// D-16: the polling fallback. Ships in Phase 1 with the client-side switch
// off (useChatStream.ts's POLLING_FALLBACK_ENABLED stays false, Plan
// 01-10) -- this route exists and is fully functional today because it
// calls the exact same repo.messages.since query the SSE Last-Event-ID
// backfill uses, so building it now is nearly free. If a future
// Coolify/Traefik deploy shows SSE is unreliable, flipping the client over
// to this route is a client-side flag change, not a new server route
// written under ship pressure. Do NOT treat this as dead code.
import type { NextRequest } from "next/server";
import { requireVisitor } from "../../../server/auth/visitor.ts";
import { requireOwner } from "../../../server/auth/guard.ts";
import { since } from "../../../server/repo/messages.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawSince = Number(url.searchParams.get("since") ?? "0");
  const sinceId = Number.isFinite(rawSince) ? rawSince : 0;

  // Owner path: an authenticated owner can poll any conversation, named by
  // a required query param -- there is no single "the" conversation for an
  // owner the way there is for a visitor.
  const owner = await requireOwner();
  if (owner) {
    const conversationIdParam = url.searchParams.get("conversationId");
    const conversationId = Number(conversationIdParam);
    if (!conversationIdParam || !Number.isFinite(conversationId)) {
      return Response.json({ error: "conversationId is required" }, { status: 400 });
    }
    const rows = await since(conversationId, sinceId);
    return Response.json(rows);
  }

  // Visitor path: allowCookieWrite:false -- a bare poll request with no
  // cookie must never mint an orphaned visitor+conversation row (same
  // reasoning as layout.tsx's read-only requireVisitor call, see
  // 01-06-SUMMARY.md).
  const session = await requireVisitor({ allowCookieWrite: false });
  if (!session.conversation) {
    return new Response(null, { status: 401 });
  }
  const rows = await since(session.conversation.id, sinceId);
  return Response.json(rows);
}
