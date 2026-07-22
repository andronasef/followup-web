import type { ReactNode } from "react";
import type { Metadata } from "next";

import "./globals.css";
import { requireVisitor } from "../server/auth/visitor.ts";
import { dirFor } from "../server/i18n/dir.ts";
import { PRE_PAINT_SCRIPT } from "./pre-paint.ts";

// D-04/D-05: iOS only launches a Home Screen bookmark in standalone mode
// (navigator.standalone === true, what IosWalkthrough.tsx/Gate.tsx's
// isIosNotStandalone() check depends on) if the manifest is actually linked
// and the apple-mobile-web-app-capable meta tag is present -- without both,
// "Add to Home Screen" just creates a normal Safari bookmark, standalone
// never becomes true no matter how many times the visitor relaunches, and
// the iOS walkthrough gate never lets them through.
export const metadata: Metadata = {
  title: "One Chat",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "One Chat",
  },
};

// D-11: cookie drives the server render. requireVisitor() is called with
// allowCookieWrite:false here -- a Server Component render cannot call
// cookies().set() (Next.js throws), so a missing/invalid cookie renders
// safe detected-language defaults and the client-side bootstrap fetch
// (src/app/pre-paint.ts -> POST /api/visitor/bootstrap) is what actually
// issues the durable cookie. This keeps the render path pure-read, never
// writing an orphaned visitor row on every no-cookie page load.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await requireVisitor({ allowCookieWrite: false });
  const dir = dirFor(session.lang);
  // 'light'/'dark' are fully server-determinable from the cookie and
  // rendered correctly in the first byte; 'system' cannot be (no reliable
  // server-side OS signal), so it renders without the class and
  // pre-paint.ts resolves it via matchMedia before first paint.
  const themeClass = session.appearance === "dark" ? "dark" : "";

  return (
    <html
      lang={session.lang}
      dir={dir}
      className={themeClass}
      data-cookie-present={session.isNewCookie ? "0" : "1"}
      data-visitor-lang={session.lang}
      data-visitor-appearance={session.appearance}
      data-visitor-id={session.visitorId ?? ""}
    >
      <head>
        {/* Raw inline synchronous script -- must run before first paint,
            never a deferred/module script (see pre-paint.ts's header). */}
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
