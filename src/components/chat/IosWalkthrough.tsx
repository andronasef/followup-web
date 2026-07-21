"use client";

// D-04/D-05/ID-04: the animated Share -> Add to Home Screen guided sequence
// an iOS Safari visitor (not yet installed) sees AT the gate, replacing the
// pre-prompt screen for that specific case -- iOS can't even show the
// native permission prompt from a non-installed tab. Per D-05 this is an
// animated/looping sequence, not a static text list: three step icons
// auto-cycle in the fixed 4:5 animation container, and their captions live
// as SEPARATE DOM text elements below/inside it (never burned into an
// asset), so iosWalkthroughStep1/2/3 localize without re-exporting
// anything.
//
// On mount, fetches a fresh vid-token (Plan 02-06) and carries it onto the
// CURRENT page's URL via history.replaceState -- so whichever URL iOS
// actually bookmarks when the visitor taps Share -> Add to Home Screen
// already has `?vid=` on it (02-RESEARCH.md Pitfall 2 -- never rely on the
// manifest's start_url alone). The "I've added it" CTA is a plain
// acknowledgement; relaunching from the Home Screen icon is what actually
// re-triggers the flow, in a fresh page load, via pre-paint.ts's
// location.search carry into bootstrap.
import { useEffect, useState } from "react";
import { Home, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStrings } from "@/lib/i18n/strings";
import type { SupportedLanguage } from "@/server/i18n/detect";

export interface IosWalkthroughProps {
  lang: SupportedLanguage;
}

const STEP_ICONS = [Share, SquarePlus, Home] as const;
const STEP_INTERVAL_MS = 1800;

export function IosWalkthrough({ lang }: IosWalkthroughProps) {
  const strings = getStrings(lang);
  const [step, setStep] = useState(0);
  const captions = [strings.iosWalkthroughStep1, strings.iosWalkthroughStep2, strings.iosWalkthroughStep3];

  // Auto-cycling loop through the three steps -- the "animated" part of
  // D-05's animated/GIF-style sequence, without shipping a real GIF/video
  // asset.
  useEffect(() => {
    const interval = setInterval(() => {
      setStep((current) => (current + 1) % STEP_ICONS.length);
    }, STEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ID-04: fetch a fresh vid-token once, on mount, and carry it onto the
  // CURRENT page URL immediately -- before any relaunch instruction.
  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/visitor/vid-token");
        if (!response.ok) return;
        const body = (await response.json()) as { token?: string };
        if (!body.token) return;
        history.replaceState(null, "", `${location.pathname}?vid=${body.token}`);
      } catch (error) {
        console.debug("[ios-walkthrough] vid-token URL carry failed silently", error);
      }
    })();
  }, []);

  const StepIcon = STEP_ICONS[step];

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 pt-8 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-[20px] leading-[1.3] font-semibold text-foreground">{strings.iosWalkthroughHeading}</h1>
        <p className="text-[16px] leading-[1.5] text-foreground">{strings.iosWalkthroughIntro}</p>
      </div>

      {/* Fixed 4:5 aspect-ratio, max-width 320px animation container (UI-SPEC Spacing Scale). */}
      <div className="flex aspect-[4/5] w-full max-w-[320px] flex-col items-center justify-center gap-6 rounded-lg bg-muted">
        <div key={step} className="animate-in fade-in zoom-in-95 duration-500">
          <StepIcon aria-hidden="true" className="size-20 text-foreground" />
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          {STEP_ICONS.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 w-1.5 rounded-full ${index === step ? "bg-primary" : "bg-muted-foreground/30"}`}
            />
          ))}
        </div>
      </div>

      {/* Captions render as separate DOM text below the container -- never burned into the asset. */}
      <ol className="flex flex-col gap-1 text-[16px] leading-[1.5]">
        {captions.map((caption, index) => (
          <li key={index} className={index === step ? "font-semibold text-foreground" : "text-muted-foreground"}>
            {caption}
          </li>
        ))}
      </ol>

      <Button type="button" size="lg" className="min-h-11">
        {strings.iosWalkthroughCta}
      </Button>
    </div>
  );
}
