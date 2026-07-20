/**
 * Single point of truth for rendering digits/numbers in the UI.
 *
 * Several supported locales (Arabic, Hindi) have native digit scripts that
 * `Number.prototype.toLocaleString()` will silently switch to (Arabic-Indic,
 * Devanagari) depending on the runtime's ICU data. This product always
 * renders plain ASCII digits regardless of the active locale — timestamps,
 * message IDs, and citation numbers must never bidi-reorder or script-switch
 * (see UI-SPEC.md icon/digit mirroring table). Use this helper instead of
 * ad-hoc `toLocaleString()` calls anywhere digits reach the UI.
 */
export function formatDigits(value: number, _locale?: string): string {
  // "en-US" always yields ASCII digits regardless of the caller's locale —
  // the locale argument is accepted for call-site readability only and is
  // intentionally never forwarded to Intl/toLocaleString.
  return value.toLocaleString("en-US", { useGrouping: false });
}
