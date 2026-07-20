// CHAT-03/CHAT-06/OPS-01: thin Next.js glue over send.ts's actual behavior.
// Kept deliberately thin -- send.ts has no next/headers dependency so
// node:test can import its exports directly (see send.ts's header comment
// for why that split exists).
import { requireVisitor } from "../../../../server/auth/visitor.ts";
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

  return Response.json(result.body, { status: result.status });
}
