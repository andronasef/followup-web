"use client";

// D-09: endonyms only (العربية, 中文, Kiswahili), never English language
// names — every row label comes from that language's own locale JSON, not
// a hardcoded list. Capped at 70vh with internal scroll (UI-SPEC.md
// long-text/overflow backstop for the language sheet).
import { useState } from "react";
import { X } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { getStrings } from "@/lib/i18n/strings";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/server/i18n/detect";

export interface LanguageSheetProps {
  lang: SupportedLanguage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after a successful PATCH so the caller can update its own lang/dir state. */
  onLanguageChange?: (lang: SupportedLanguage) => void;
}

export function LanguageSheet({ lang, open, onOpenChange, onLanguageChange }: LanguageSheetProps) {
  const strings = getStrings(lang);
  const [pending, setPending] = useState<SupportedLanguage | null>(null);

  async function selectLanguage(next: SupportedLanguage) {
    if (pending) return;
    setPending(next);
    try {
      const response = await fetch("/api/chat/prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: next }),
      });
      if (response.ok) {
        onLanguageChange?.(next);
        onOpenChange(false);
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[70vh]">
        <DrawerHeader className="flex flex-row items-center justify-between gap-4 pt-8 text-start">
          <DrawerTitle className="text-[20px] leading-[1.3] font-semibold">
            {strings.languageSheetTitle}
          </DrawerTitle>
          <DrawerClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0"
              aria-label={strings.closeAriaLabel}
            >
              <X aria-hidden="true" />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-4">
          {SUPPORTED_LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              className="flex min-h-11 w-full items-center rounded-lg px-4 py-3 text-start text-[16px] leading-[1.5] outline-none focus-visible:ring-3 focus-visible:ring-primary/50 aria-pressed:bg-muted disabled:opacity-50"
              aria-pressed={code === lang}
              disabled={pending !== null}
              onClick={() => selectLanguage(code)}
            >
              {getStrings(code).languageName}
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
