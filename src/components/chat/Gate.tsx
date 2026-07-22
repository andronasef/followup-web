"use client";

// PUSH-01…05/D-04/D-06: the real once-per-device push permission gate,
// replacing Phase 1's unconditional bypass shell. This file covers the
// non-iOS path (Task 1) — Task 2 layers an iOS Add-to-Home-Screen
// walkthrough branch on top via IosWalkthrough.tsx.
//
// State machine, once per device:
//   1. On mount, check localStorage's "oneChatPushGateDecided" flag. If
//      "1" (a grant, a decline, or a dismiss already happened on this
//      device), render {children} immediately — the gate never re-shows.
//   2. Otherwise render the full-viewport gate takeover (same swap-in/out
//      pattern the Phase 1 shell used, not a Drawer/dialog per UI-SPEC's
//      Design System note): heading/body/Allow CTA.
//   3. The Allow CTA's onClick calls Notification.requestPermission() as
//      its literal first statement — no await/state update precedes it —
//      preserving the user-gesture requirement the browser enforces.
//   4. "granted": mark decided, subscribe, show the bounded "Confirming…"
//      Label text, then render {children} regardless of the subscribe
//      probe's own result (PUSH-12 — a probe failure is server-logged
//      only, never surfaced here).
//   5. "denied"/"default" (dismissed): mark decided (D-06 — decided
//      either way, never re-shown) and show the gentle re-ask screen; its
//      Try-again CTA re-enters the same requestPermission()-first flow.
//      Simply closing/navigating away leaves {children} rendering on the
//      visitor's next visit, since the flag is already set.
//
// The same mount effect also fires the "shown" funnel beacon (once, on
// the gate's own first render, before any interaction), the ID-03
// identity-recovery piggyback, and PUSH-11's every-open re-sync — all
// independent of whether the gate itself is shown this visit.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { IosWalkthrough } from "./IosWalkthrough";
import { getStrings } from "@/lib/i18n/strings";
import {
  detectPlatform,
  sendGateEventBeacon,
  subscribeToPush,
  syncSubscriptionOnOpen,
} from "@/lib/push/subscribe-client";
import type { SupportedLanguage } from "@/server/i18n/detect";

/** Safari-only property, not in the standard DOM lib typings. */
type NavigatorWithStandalone = Navigator & { standalone?: boolean };

/** True only for an iOS Safari visitor NOT already running in an installed/standalone context. */
function isIosNotStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as NavigatorWithStandalone;
  const standalone = nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return detectPlatform() === "ios" && !standalone;
}

/** localStorage key mirroring the last endpoint synced to the server — PUSH-11's re-sync comparison point. */
const GATE_ENDPOINT_KEY = "oneChatPushEndpoint";

type GateScreen = "prompt" | "confirming" | "declined";

export interface GateProps {
  children: ReactNode;
  lang: SupportedLanguage;
}

/**
 * ID-03/CR-01: swaps a freshly minted, orphaned identity for the one this
 * device's live push subscription is already bound to. Returns true when
 * the server accepted the recovery (and therefore re-issued the visitor
 * cookie), false on every other branch. Never throws.
 */
async function recoverIdentityByEndpoint(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;
    const response = await fetch("/api/push/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    return response.ok;
  } catch (error) {
    console.debug("[push] ID-03 endpoint recovery failed silently", error);
    return false;
  }
}

async function refreshStoredEndpoint(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      window.localStorage.setItem(GATE_ENDPOINT_KEY, subscription.endpoint);
    }
  } catch {
    // Best-effort only — a stale/missing endpoint just means the next
    // mount's PUSH-11 sync re-POSTs, which is harmless.
  }
}

export function Gate({ children, lang }: GateProps) {
  const strings = getStrings(lang);
  // Lazy init reads localStorage synchronously where available (browser
  // CSR/hydration), so an already-decided device renders {children}
  // without a gate-UI flash. Server-side (no window), this is false —
  // the safe, never-under-block default.
  const [showChildren, setShowChildren] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem("oneChatPushGateDecided") === "1",
  );
  const [screen, setScreen] = useState<GateScreen>("prompt");
  // Lazy init for the same SSR-safe reason as showChildren above -- iOS
  // standalone/platform detection is client-only info.
  const [iosWalkthrough] = useState<boolean>(() => isIosNotStandalone());
  const shownBeaconFired = useRef(false);

  useEffect(() => {
    // Fire-and-forget SW registration — log-only on failure, never blocks
    // the gate's own render.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.debug("[push] service worker registration failed", error);
      });
    }

    const alreadyDecided = window.localStorage.getItem("oneChatPushGateDecided") === "1";
    setShowChildren(alreadyDecided);

    if (!alreadyDecided && !shownBeaconFired.current) {
      shownBeaconFired.current = true;
      sendGateEventBeacon("shown", detectPlatform());
    }

    // CR-01: ONE sequential effect, not two concurrent IIFEs. Recovery and
    // the PUSH-11 re-sync both POST this device's endpoint; running them
    // concurrently made correctness depend on which request the server
    // happened to handle first. Recovery now deterministically goes first,
    // and the re-sync only runs if recovery did not already reload the page
    // with the right identity.
    (async () => {
      // ID-03: a fresh identity was just minted THIS render (layout.tsx's
      // data-cookie-present="0") — if this device already has a live push
      // subscription, recover the prior visitor identity instead of
      // orphaning a brand-new one.
      if (document.documentElement.dataset.cookiePresent === "0") {
        if (await recoverIdentityByEndpoint()) {
          window.location.reload();
          return;
        }
      }

      // PUSH-11: re-sync on every mount, regardless of the gate-decided flag.
      const lastKnownEndpoint = window.localStorage.getItem(GATE_ENDPOINT_KEY);
      const outcome = await syncSubscriptionOnOpen(lastKnownEndpoint);
      // The server refused to rebind a device it already owns under
      // another visitor — that is the authoritative signal that THIS
      // identity is the orphan, so recover even without the no-cookie
      // marker.
      if (outcome === "conflict" && (await recoverIdentityByEndpoint())) {
        window.location.reload();
        return;
      }
      await refreshStoredEndpoint();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  async function handleAllow() {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      window.localStorage.setItem("oneChatPushGateDecided", "1");
      sendGateEventBeacon("prompt_reached", detectPlatform());
      setScreen("confirming");
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
      const { outcome } = await subscribeToPush(publicKey);
      // CR-01: this device is already bound to another visitor id — the
      // one holding this conversation. Recover into it rather than letting
      // the grant land on an orphaned identity.
      if (outcome === "conflict" && (await recoverIdentityByEndpoint())) {
        window.location.reload();
        return;
      }
      await refreshStoredEndpoint();
      // PUSH-12: let the visitor in either way — a probe failure is
      // server-logged only, never surfaced here.
      setShowChildren(true);
    } else {
      window.localStorage.setItem("oneChatPushGateDecided", "1");
      setScreen("declined");
    }
  }

  if (showChildren) {
    return <>{children}</>;
  }

  if (screen === "confirming") {
    return (
      <GateFrame heading={strings.pushGateHeading} body={strings.pushGateBody}>
        <p className="text-[14px] leading-[1.4] font-normal text-muted-foreground" role="status">
          {strings.pushGateConfirming}
        </p>
      </GateFrame>
    );
  }

  if (screen === "declined") {
    return (
      <GateFrame heading={strings.pushGateDeclinedHeading} body={strings.pushGateDeclinedBody}>
        <Button type="button" size="lg" className="min-h-11" onClick={handleAllow}>
          {strings.pushGateRetryCta}
        </Button>
      </GateFrame>
    );
  }

  // D-04: the walkthrough REPLACES the pre-prompt screen for an iOS
  // Safari visitor not already running standalone -- permission can't even
  // be requested from a non-installed iOS tab. An already-installed iOS
  // visitor (standalone === true, checked fresh on this mount, i.e. after
  // a real relaunch from the Home Screen icon) falls through to the same
  // normal flow below, unchanged.
  if (iosWalkthrough) {
    return <IosWalkthrough lang={lang} />;
  }

  return (
    <GateFrame heading={strings.pushGateHeading} body={strings.pushGateBody}>
      <Button type="button" size="lg" className="min-h-11" onClick={handleAllow}>
        {strings.pushGateAllowCta}
      </Button>
    </GateFrame>
  );
}

/** Full-viewport takeover shared by every gate screen — one accent CTA (or bounded status text), never a Drawer/dialog. */
function GateFrame({ heading, body, children }: { heading: string; body: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 pt-8 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-[20px] leading-[1.3] font-semibold text-foreground">{heading}</h1>
        <p className="text-[16px] leading-[1.5] text-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}
