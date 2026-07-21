// CHAT-03/CHAT-06/OPS-01: thin Next.js glue over send.ts's actual behavior.
// Kept deliberately thin -- send.ts has no next/headers dependency so
// node:test can import its exports directly (see send.ts's header comment
// for why that split exists).
//
// TRANS-01: this is the one file allowed to touch request-scoped APIs
// (RESEARCH.md Pattern 1: Next's `after()` requires request scope), so the
// async visitor->owner translation trigger lives here, never in send.ts --
// scheduled via after(), never awaited before the 200 response is
// constructed, so a slow/failing translation call can never delay or block
// the visitor's response (T-02-14).
import { after } from "next/server";
import { requireVisitor } from "../../../../server/auth/visitor.ts";
import { OWNER_LANG } from "../../../../server/config/models.ts";
import { translateAndCache } from "../../../../server/translation/cache.ts";
import { clientIp, sendVisitorMessage } from "./send.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireVisitor();
  const conversation = session.conversation;
  if (!conversation || !session.visitorId) {
    return Response.json({ error: "no_conversation" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const result = await sendVisitorMessage({
    conversationId: conversation.id,
    visitorId: session.visitorId,
    ip: clientIp(request),
    rawBody,
  });

  if (result.status === 200 && session.lang !== OWNER_LANG) {
    const { id, messageBody } = result.body;
    const sourceLang = session.lang;
    after(() => translateAndCache(id, messageBody, sourceLang, OWNER_LANG));
  }

  return Response.json(result.body, { status: result.status });
}
