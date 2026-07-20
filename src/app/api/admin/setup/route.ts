// D-14: one-time owner-account creation, 404-by-construction. See
// 01-RESEARCH.md Pattern 5 and 01-CONTEXT.md's D-14 hard constraint -- the
// existence check is the literal first operation, before any header or
// body access, and it is never cached: it runs fresh, straight against
// the DB, on every request, so this holds across a container restart and
// a fresh deploy against an existing DB, not just within one process
// lifetime.
import { z } from "zod";
import { anyResponderExists, createResponder } from "../../../../server/repo/responders.ts";
import { hashPassword } from "../../../../server/auth/password.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const setupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
});

export async function POST(request: Request) {
  // First DB operation, before touching the request body or the setup
  // token at all -- once a responder row exists this route is permanently
  // dead, and it must be indistinguishable from a route that was never
  // there.
  if (await anyResponderExists()) {
    return new Response(null, { status: 404 });
  }

  // A mismatch also returns 404, not 403 -- a 403 would confirm to a
  // prober that the route exists and is merely gated, which 404 does not.
  const token = request.headers.get("x-setup-token");
  if (!token || token !== process.env.SETUP_TOKEN) {
    return new Response(null, { status: 404 });
  }

  const parsed = setupSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await createResponder({
    email: parsed.data.email,
    passwordHash,
    displayName: parsed.data.displayName ?? null,
  });

  return Response.json({ ok: true });
}
