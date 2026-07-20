"use client";

// D-06: a quiet status line under the header — plain Label-weight
// (14px/400) text in --muted-foreground, no background color, no dot, no
// icon. Reuses the exact same presence-derived copy Welcome's line 2
// shows, so the two never disagree. Styled so it cannot read as a third
// header control (CHAT-09) or a colored support-widget status dot.
import { getStrings } from "@/lib/i18n/strings";
import { usePresence } from "@/lib/chat/usePresence";
import type { SupportedLanguage } from "@/server/i18n/detect";

export interface PresenceLineProps {
  lang: SupportedLanguage;
}

export function PresenceLine({ lang }: PresenceLineProps) {
  const strings = getStrings(lang);
  const { isOwnerOnline } = usePresence();
  const text = isOwnerOnline ? strings.welcomeLine2Online : strings.welcomeLine2Offline;

  return <p className="px-4 text-[14px] leading-[1.4] font-normal text-muted-foreground">{text}</p>;
}
