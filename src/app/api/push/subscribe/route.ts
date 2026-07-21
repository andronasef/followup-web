// PUSH-12: thin Next.js glue over subscribe.ts's actual behavior. Mirrors
// chat/messages/route.ts's exact shape -- subscribe.ts has no next/headers
// dependency so node:test can import its exports directly.
import { requireVisitor } from "../../../../server/auth/visitor.ts";
import { handleSubscribe } from "../../../../server/push/subscribe.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireVisitor();
  if (!session.visitorId) {
    return Response.json({ error: "no_visitor" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const result = await handleSubscribe({
    visitorId: session.visitorId,
    lang: session.lang,
    rawBody,
  });

  return Response.json(result.body, { status: result.status });
}
