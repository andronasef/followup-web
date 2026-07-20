import type { SupportedLanguage } from "./detect.ts";

const RTL_LANGUAGES: ReadonlySet<SupportedLanguage> = new Set(["ar"]);

/** Returns 'rtl' for Arabic, 'ltr' for every other supported language. */
export function dirFor(languageCode: SupportedLanguage | string): "ltr" | "rtl" {
  return RTL_LANGUAGES.has(languageCode as SupportedLanguage) ? "rtl" : "ltr";
}
