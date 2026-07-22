// ADMIN-01: thin wrapper only. Every behavior -- the zod schema, the
// CR-03 per-hashed-IP throttle, the constant-shape dummy-hash verify, the
// non-enumerating 401 convergence, and the owner-session signing -- lives
// in the next/headers-free login.ts beside this file, mirroring how every
// other write route in this repo is split (send.ts/route.ts,
// reply.ts/route.ts, recover.ts/route.ts).
import { cookies } from "next/headers";
import { clientIp } from "../../../../server/http/ip.ts";
import { handleAdminLogin } from "./login.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const result = await handleAdminLogin({
    ip: clientIp(request),
    rawBody: await request.json().catch(() => ({})),
  });

  if (result.status === 200) {
    const cookieStore = await cookies();
    cookieStore.set("owner_session", result.cookieValue, {
      httpOnly: true,
      secure: true,
      // Strict, not Lax -- there is no cross-site navigation requirement for
      // an admin-only surface. The visitor cookie stays Lax (ID-01) since a
      // shared link is itself a cross-site navigation.
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // matches signOwnerSession's 7-day expiration
    });
  }

  return Response.json(result.body, { status: result.status });
}
