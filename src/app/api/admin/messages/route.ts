// ADMIN-03: thin Next.js glue over reply.ts's actual behavior.
// requireOwner()-guarded instead of rate-limited (an authenticated single
// owner isn't the DoS surface OPS-01 exists for). Kept thin so reply.ts's
// next/headers-free exports stay directly testable by node:test.
import { requireOwner } from "../../../../server/auth/guard.ts";
import { handleAdminReply } from "./reply.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const owner = await requireOwner();
  const rawBody = await request.json().catch(() => ({}));
  const result = await handleAdminReply({ ownerId: owner?.sub ?? null, rawBody });
  return Response.json(result.body, { status: result.status });
}
