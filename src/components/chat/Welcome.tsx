"use client";

// D-05/D-08: rendered client-side from locale JSON, never a row in
// `messages` — re-renders instantly on a language switch since nothing
// round-trips to the server. Exactly two lines: warmth (Heading role,
// 20px/600/1.3), then an honest presence-driven line (Body role,
// 16px/400/1.5). No third line, no "who I am" preamble.
import { getStrings } from "@/lib/i18n/strings";
import { usePresence } from "@/lib/chat/usePresence";
import type { SupportedLanguage } from "@/server/i18n/detect";

export interface WelcomeProps {
  lang: SupportedLanguage;
}

export function Welcome({ lang }: WelcomeProps) {
  const strings = getStrings(lang);
  const { isOwnerOnline } = usePresence();
  const line2 = isOwnerOnline ? strings.welcomeLine2Online : strings.welcomeLine2Offline;

  return (
    <div className="mb-6 px-4">
      <p className="text-[20px] leading-[1.3] font-semibold text-foreground">{strings.welcomeLine1}</p>
      <p className="mt-1 text-[16px] leading-[1.5] text-foreground">{line2}</p>
    </div>
  );
}
