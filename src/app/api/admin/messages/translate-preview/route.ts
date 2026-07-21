// TRANS-02/TRANS-03: thin Next.js glue over translate-preview.ts's actual
// behavior. requireOwner()-guarded, same shape as admin/messages/route.ts.
import { requireOwner } from "../../../../../server/auth/guard.ts";
import { translatePreview } from "../translate-preview.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const owner = await requireOwner();
  const rawBody = await request.json().catch(() => ({}));
  const result = await translatePreview({ ownerId: owner?.sub ?? null, rawBody });
  return Response.json(result.body, { status: result.status });
}
