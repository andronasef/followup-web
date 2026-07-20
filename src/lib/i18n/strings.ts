/**
 * Shared client-safe locale string lookup. Every visitor-facing component
 * (Header, LanguageSheet, Welcome, PresenceLine — Plan 01-09; the composer
 * and message list — Plan 01-10) needs the same "resolve the active
 * language's locale JSON" operation, so it lives here once rather than
 * four separate ad-hoc imports. Not listed in any single plan's
 * files_modified because it is a cross-cutting seam multiple standalone
 * component plans need (Rule 2 — missing critical functionality).
 *
 * Statically imports all 10 locale files (they are small, and this keeps
 * every locale in one client bundle — no per-language code-splitting
 * complexity for a JSON-only i18n system).
 */
import type { SupportedLanguage } from "@/server/i18n/detect";
import en from "./locales/en.json";
import ar from "./locales/ar.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import pt from "./locales/pt.json";
import hi from "./locales/hi.json";
import zh from "./locales/zh.json";
import ru from "./locales/ru.json";
import id from "./locales/id.json";
import sw from "./locales/sw.json";

export type Strings = typeof en;

const ALL_STRINGS: Record<SupportedLanguage, Strings> = { en, ar, es, fr, pt, hi, zh, ru, id, sw };

/** Returns the locale JSON for `lang`, falling back to English if somehow missing. */
export function getStrings(lang: SupportedLanguage): Strings {
  return ALL_STRINGS[lang] ?? ALL_STRINGS.en;
}
