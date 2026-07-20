"use client";

import type { ReactNode } from "react";

/**
 * Phase 1 shell only. The real hard-block push-permission gate — with its
 * guided iOS "Add to Home Screen" screen and the actual
 * Notification.requestPermission() flow — ships in Phase 2
 * (01-RESEARCH.md's Architectural Responsibility Map lists this exact
 * bypass as the Phase 1 "Push gate shell" row: "no permission logic, no
 * service-worker push handling yet — only the manifest + SW registration
 * scaffolding"). UI-SPEC.md explicitly excludes the real Gate's UI from
 * this phase's design contract, so there is nothing designed to render in
 * the not-bypassed branch yet either.
 *
 * NEXT_PUBLIC_PUSH_GATE_BYPASS defaults to bypassed (children render
 * immediately, no permission prompt) so Phase 1 builds never block on a
 * gate that doesn't exist yet. Set it to "off" once Phase 2 implements the
 * real gate UI in the branch below.
 */
const isPushGateBypassed = process.env.NEXT_PUBLIC_PUSH_GATE_BYPASS !== "off";

export function Gate({ children }: { children: ReactNode }) {
  if (!isPushGateBypassed) {
    // Phase 2 replaces this branch with the real permission-request UI.
    return <>{children}</>;
  }

  return <>{children}</>;
}
