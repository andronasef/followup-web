import type { ReactNode } from "react";
import type { Metadata } from "next";

import "./globals.css";

// Cookie-driven <html lang dir class> (D-11) lands in Plan 01-06 — this
// layout is only the walking-skeleton shell that proves the app boots.
export const metadata: Metadata = {
  title: "One Chat",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
