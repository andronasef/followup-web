// Next 16's rename of middleware.ts -- exported function must be named
// `proxy`, not `middleware`. proxy.ts is nodejs-only in Next 16 and its
// runtime is not configurable (no `edge` option) -- see 01-RESEARCH.md's
// Next.js 16 Migration Notes -- so this reads the DB-free jose verify
// directly rather than going through guard.ts's next/headers-based
// requireOwner().
//
// Guards every /admin/* route except /admin/setup and /admin/login --
// those two are the only ways to obtain an owner cookie in the first
// place, so they must stay reachable without one.
import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "./server/auth/session.ts";
import { OWNER_COOKIE_NAME } from "./server/auth/guard.ts";

export const proxy = async (request: NextRequest): Promise<NextResponse> => {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/setup" || pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = request.cookies.get(OWNER_COOKIE_NAME)?.value;

  if (token) {
    try {
      const payload = await verifySession(token);
      // A visitor-typed cookie verifies fine (same signing secret) but
      // must never grant admin access -- only typ === 'owner' passes.
      if (payload.typ === "owner") {
        return NextResponse.next();
      }
    } catch {
      // Invalid/expired/tampered -- falls through to the redirect below,
      // same as a missing cookie.
    }
  }

  return NextResponse.redirect(new URL("/admin/login", request.url));
};

export const config = {
  matcher: ["/admin/:path*"],
};
