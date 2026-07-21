// ID-03: thin Next.js glue over recover.ts's actual behavior. Mirrors
// chat/messages/ack/route.ts's exact shape -- recover.ts has no
// next/headers dependency so node:test can import its exports directly.
import { cookies } from "next/headers";
import { VISITOR_COOKIE_NAME, VISITOR_COOKIE_OPTIONS } from "../../../../server/auth/visitor.ts";
import { handleRecover } from "../../../../server/push/recover.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => ({}));
  const result = await handleRecover(rawBody);

  if (result.status === 200) {
    const cookieStore = await cookies();
    cookieStore.set(VISITOR_COOKIE_NAME, result.cookieValue, VISITOR_COOKIE_OPTIONS);
    return Response.json(result.body, { status: 200 });
  }

  return Response.json(result.body, { status: result.status });
}
