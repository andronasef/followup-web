"use client";

// CHAT-09: exactly two controls, nothing else. Neither icon is on the
// UI-SPEC.md mirroring allowlist (Languages, Sun/Moon both "No") so
// neither ever gets an rtl: mirror class. Accent (--primary) is reserved
// for the outgoing bubble / send button / focus rings elsewhere — this
// header intentionally uses only neutral variants, never bg-primary.
import { useState } from "react";
import { Languages, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStrings } from "@/lib/i18n/strings";
import type { SupportedLanguage } from "@/server/i18n/detect";

export interface HeaderProps {
  lang: SupportedLanguage;
  /** Resolved boolean (not the raw 'system'/'light'/'dark' preference) — the caller already knows which class is on <html>. */
  isDark: boolean;
  onOpenLanguageSheet: () => void;
  /** Fires after a successful PATCH so the caller can sync <html class> and any local appearance state. */
  onAppearanceChange?: (isDark: boolean) => void;
}

export function Header({ lang, isDark, onOpenLanguageSheet, onAppearanceChange }: HeaderProps) {
  const strings = getStrings(lang);
  const [pending, setPending] = useState(false);

  async function toggleAppearance() {
    if (pending) return;
    const nextIsDark = !isDark;
    setPending(true);
    try {
      const response = await fetch("/api/chat/prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appearance: nextIsDark ? "dark" : "light" }),
      });
      if (response.ok) {
        document.documentElement.classList.toggle("dark", nextIsDark);
        onAppearanceChange?.(nextIsDark);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <header className="flex items-center justify-between px-4 py-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label={strings.changeLanguageAriaLabel}
        onClick={onOpenLanguageSheet}
      >
        <Languages aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label={isDark ? strings.appearanceAriaLabelLight : strings.appearanceAriaLabelDark}
        onClick={toggleAppearance}
        disabled={pending}
      >
        {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </Button>
    </header>
  );
}
