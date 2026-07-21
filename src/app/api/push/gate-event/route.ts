// OPS-11: thin Next.js glue over gateEvent.ts's actual behavior. Mirrors
// chat/messages/route.ts's exact shape.
import { requireVisitor } from "../../../../server/auth/visitor.ts";
import { handleGateEvent } from "../../../../server/push/gateEvent.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireVisitor();
  if (!session.visitorId) {
    return Response.json({ error: "no_visitor" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const result = await handleGateEvent({
    visitorId: session.visitorId,
    rawBody,
  });

  if (result.status === 400) {
    return Response.json(result.body, { status: result.status });
  }
  return new Response(null, { status: result.status });
}
