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
 *
 * Import attributes (`with { type: "json" }`) added in Plan 02-04: plain
 * Node's ESM loader (used by every `node --experimental-strip-types --test`
 * invocation in this repo) requires an explicit `type: "json"` import
 * attribute on a `.json` specifier since Node 22 — without it, importing
 * this module outside Next's bundler throws `ERR_IMPORT_ATTRIBUTE_MISSING`.
 * Next's bundler and TypeScript 6's checker both already support this
 * standard ESM syntax, so this is additive, not a behavior change for the
 * existing client components that import `getStrings`.
 */
import type { SupportedLanguage } from "@/server/i18n/detect";
import en from "./locales/en.json" with { type: "json" };
import ar from "./locales/ar.json" with { type: "json" };
import es from "./locales/es.json" with { type: "json" };
import fr from "./locales/fr.json" with { type: "json" };
import pt from "./locales/pt.json" with { type: "json" };
import hi from "./locales/hi.json" with { type: "json" };
import zh from "./locales/zh.json" with { type: "json" };
import ru from "./locales/ru.json" with { type: "json" };
import id from "./locales/id.json" with { type: "json" };
import sw from "./locales/sw.json" with { type: "json" };

export type Strings = typeof en;

const ALL_STRINGS: Record<SupportedLanguage, Strings> = { en, ar, es, fr, pt, hi, zh, ru, id, sw };

/** Returns the locale JSON for `lang`, falling back to English if somehow missing. */
export function getStrings(lang: SupportedLanguage): Strings {
  return ALL_STRINGS[lang] ?? ALL_STRINGS.en;
}
