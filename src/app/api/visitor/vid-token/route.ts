// ID-04: on-demand vid-token issuance for an ALREADY-identified session --
// this route never mints a visitor, only signs a fresh, short-purpose
// token for the caller's OWN session (T-02-21). Plan 02-07's
// IosWalkthrough.tsx calls this once and embeds the token in a `?vid=` URL
// param (via history.replaceState) before telling the visitor to relaunch
// from the Home Screen icon -- see src/app/pre-paint.ts's location.search
// carry, the mechanism that completes this on the other end.
import { requireVisitor } from "../../../../server/auth/visitor.ts";
import { signVisitorId } from "../../../../server/auth/session.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireVisitor();
  if (!session.visitorId) {
    return Response.json({ error: "no_visitor" }, { status: 401 });
  }

  const token = await signVisitorId(session.visitorId, {
    lang: session.lang,
    appearance: session.appearance,
  });

  return Response.json({ token }, { status: 200 });
}
