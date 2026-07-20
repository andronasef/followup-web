/**
 * Confirmed language list (TRANSLATION-SPIKE-GO-NO-GO.md): the owner explicitly
 * overrode the automated Swahili NO-GO and chose to ship all ten languages.
 * Do not add a language-family mapping table here (D-10) — an unsupported
 * browser locale always falls back to plain English.
 */
export const SUPPORTED_LANGUAGES = [
  "en",
  "ar",
  "es",
  "fr",
  "pt",
  "hi",
  "zh",
  "ru",
  "id",
  "sw",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const DEFAULT_LANGUAGE: SupportedLanguage = "en";

interface ParsedTag {
  code: string;
  quality: number;
}

/** Parses an Accept-Language header into base-subtag/quality pairs, sorted by quality descending. */
function parseAcceptLanguage(header: string): ParsedTag[] {
  return header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [tag, ...params] = part.split(";").map((s) => s.trim());
      const qParam = params.find((p) => p.startsWith("q="));
      const quality = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      const baseSubtag = tag.split("-")[0]?.toLowerCase() ?? "";
      return { code: baseSubtag, quality: Number.isFinite(quality) ? quality : 1 };
    })
    .sort((a, b) => b.quality - a.quality);
}

/**
 * Returns the first tag in the Accept-Language header (by quality order) whose
 * base subtag is a member of `supported`. Falls back directly to English when
 * the header is absent or no tag matches — no language-family guessing (D-10).
 */
export function detectLanguage(
  acceptLanguageHeader: string | undefined | null,
  supported: readonly string[] = SUPPORTED_LANGUAGES,
): SupportedLanguage {
  if (!acceptLanguageHeader) return DEFAULT_LANGUAGE;

  const tags = parseAcceptLanguage(acceptLanguageHeader);
  for (const { code } of tags) {
    if (supported.includes(code)) {
      return code as SupportedLanguage;
    }
  }
  return DEFAULT_LANGUAGE;
}
