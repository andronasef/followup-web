// PUSH-08: thin Next.js glue over ack.ts's actual behavior. Mirrors
// chat/messages/route.ts's exact shape -- ack.ts has no next/headers
// dependency so node:test can import its exports directly.
import { requireVisitor } from "../../../../../server/auth/visitor.ts";
import { handleAck } from "../ack.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireVisitor();
  const conversation = session.conversation;
  if (!conversation) {
    return Response.json({ error: "no_conversation" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const result = await handleAck({ conversationId: conversation.id, rawBody });

  if (result.status === 200) {
    return new Response(null, { status: 200 });
  }
  return Response.json(result.body, { status: result.status });
}
