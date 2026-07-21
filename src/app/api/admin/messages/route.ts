// ADMIN-03/PUSH-06/PUSH-08: thin Next.js glue over reply.ts's actual
// behavior. requireOwner()-guarded instead of rate-limited (an
// authenticated single owner isn't the DoS surface OPS-01 exists for).
// Kept thin so reply.ts's next/headers-free exports stay directly
// testable by node:test.
//
// This is the one file allowed to touch request-scoped APIs (RESEARCH.md
// Pattern 1: Next's after() requires request scope), so the push-send
// trigger lives here, never in reply.ts -- scheduled via after(), never
// awaited before the 200 response is constructed, so a slow/failing push
// send can never delay or block the owner's response. Mirrors Plan
// 02-05's chat/messages/route.ts translation-trigger split exactly.
import { after } from "next/server";
import { requireOwner } from "../../../../server/auth/guard.ts";
import { sendPushToVisitor } from "../../../../server/push/send.ts";
import { handleAdminReply } from "./reply.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const owner = await requireOwner();
  const rawBody = await request.json().catch(() => ({}));
  const result = await handleAdminReply({ ownerId: owner?.sub ?? null, rawBody });

  if (result.status === 200) {
    const { conversationId, id, visitorId, visitorLang } = result.body;
    after(() => sendPushToVisitor(conversationId, id, visitorId, visitorLang));
  }

  return Response.json(result.body, { status: result.status });
}
