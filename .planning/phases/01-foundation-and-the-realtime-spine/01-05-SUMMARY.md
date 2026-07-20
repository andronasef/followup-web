---
phase: 01-foundation-and-the-realtime-spine
plan: 05
subsystem: i18n
tags: [i18n, rtl, locale, next.js, node:test]

# Dependency graph
requires:
  - phase: 01-foundation-and-the-realtime-spine (01-01)
    provides: Next.js app shell, tsconfig with .ts import-extension support
  - phase: 01-foundation-and-the-realtime-spine (01-02)
    provides: TRANSLATION-SPIKE-GO-NO-GO.md — confirmed 10-language list (owner override, all ten ship including Swahili)
provides:
  - "src/server/i18n/detect.ts — SUPPORTED_LANGUAGES (10 codes) and detectLanguage(), no language-family mapping table"
  - "src/server/i18n/dir.ts — dirFor(), Arabic-only RTL"
  - "src/lib/i18n/format.ts — formatDigits(), ASCII-digit single point of truth"
  - "src/lib/i18n/locales/{en,ar,es,fr,pt,hi,zh,ru,id,sw}.json — complete, key-parity-verified locale sets"
affects: [01-09-language-sheet, 01-10-visitor-chat-shell, 01-11-admin-surface]

tech-stack:
  added: []
  patterns:
    - "i18n detection/direction/formatting live under src/server/i18n (server-only) and src/lib/i18n (shared/client-safe), matching the existing src/server vs src/lib split"
    - "node:test with explicit .ts import extensions, consistent with src/server/auth and src/server/repo test conventions"

key-files:
  created:
    - src/server/i18n/detect.ts
    - src/server/i18n/detect.test.ts
    - src/server/i18n/dir.ts
    - src/server/i18n/dir.test.ts
    - src/lib/i18n/format.ts
    - src/lib/i18n/format.test.ts
    - src/lib/i18n/locales/en.json
    - src/lib/i18n/locales/ar.json
    - src/lib/i18n/locales/es.json
    - src/lib/i18n/locales/fr.json
    - src/lib/i18n/locales/pt.json
    - src/lib/i18n/locales/hi.json
    - src/lib/i18n/locales/zh.json
    - src/lib/i18n/locales/ru.json
    - src/lib/i18n/locales/id.json
    - src/lib/i18n/locales/sw.json
  modified:
    - package.json

key-decisions:
  - "Confirmed 10-language list read from TRANSLATION-SPIKE-GO-NO-GO.md's owner sign-off (ships Swahili despite the automated NO-GO), not re-litigated here."
  - "detectLanguage() matches only the base subtag (e.g. 'ar' from 'ar-SA') against SUPPORTED_LANGUAGES membership — zero mapping/similarity table, per D-10's explicit prohibition."
  - "formatDigits() always calls toLocaleString('en-US', { useGrouping: false }) regardless of the locale argument passed in, guaranteeing ASCII digits everywhere per RESEARCH.md's Don't-Hand-Roll guidance."
  - "Added a languageName key (endonym, e.g. العربية / 中文 / Kiswahili) to every locale file beyond the 17 literal Copywriting Contract keys — the plan's action step calls this out explicitly for Plan 01-09's language sheet (D-09)."

patterns-established:
  - "Locale JSON key-set parity is mechanically verified (sorted-key-list diff across all files), not assumed — same script embedded in the plan's <verify> block."

requirements-completed: [LANG-01, LANG-07]

coverage:
  - id: D1
    description: "detectLanguage() picks the highest-quality supported Accept-Language tag by base subtag, falls back to English with no header and no language-family guess for unsupported locales"
    requirement: "LANG-01"
    verification:
      - kind: unit
        ref: "src/server/i18n/detect.test.ts#detect: returns 'ar' when Accept-Language prefers a supported Arabic tag"
        status: pass
      - kind: unit
        ref: "src/server/i18n/detect.test.ts#detect: falls back to 'en' for an unsupported locale, no family-mapping guess"
        status: pass
      - kind: unit
        ref: "src/server/i18n/detect.test.ts#detect: falls back to 'en' when no Accept-Language header is present"
        status: pass
    human_judgment: false
  - id: D2
    description: "dirFor() returns 'rtl' for Arabic only, 'ltr' for every other of the 10 confirmed languages"
    requirement: "LANG-01"
    verification:
      - kind: unit
        ref: "src/server/i18n/dir.test.ts#dir: exactly one supported language is rtl"
        status: pass
    human_judgment: false
  - id: D3
    description: "formatDigits() renders plain ASCII digits regardless of locale argument (no Arabic-Indic/Devanagari digit leakage)"
    requirement: "LANG-01"
    verification:
      - kind: unit
        ref: "src/lib/i18n/format.test.ts#format: never emits Arabic-Indic or Devanagari digit characters"
        status: pass
    human_judgment: false
  - id: D4
    description: "All 10 locale JSON files (en, ar, es, fr, pt, hi, zh, ru, id, sw) exist with an identical, non-empty 18-key set matching UI-SPEC.md's Copywriting Contract plus languageName"
    requirement: "LANG-07"
    verification:
      - kind: other
        ref: "node -e key-parity script from 01-05-PLAN.md's <verify> block — 'ok 10 locales', 18 keys, 0 empty values"
        status: pass
    human_judgment: false
  - id: D5
    description: "Translation quality/naturalness/tone fidelity of the 9 non-English locale files against the English source"
    verification: []
    human_judgment: true
    rationale: "Hand-authored offline per the plan's explicit instruction (no live translation API call in this task). Structural completeness (key parity, non-empty values) is mechanically verified, but fluency and tone — especially Swahili, already flagged in STATE.md as a deferred, unverified-in-production risk — require bilingual/native review, which is outside this executor's capability."

duration: 12min
completed: 2026-07-20
status: complete
---

# Phase 01 Plan 05: Language Detection, Direction, and Locale Content Summary

**Accept-Language-based `detectLanguage()`/`dirFor()`/ASCII-only `formatDigits()` helpers plus all 10 confirmed-language locale JSON files (en, ar, es, fr, pt, hi, zh, ru, id, sw), key-parity verified**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-20T16:08:29+03:00
- **Completed:** 2026-07-20T16:16:32+03:00
- **Tasks:** 2
- **Files modified:** 17 (16 created, 1 modified)

## Accomplishments

- `src/server/i18n/detect.ts` exports `SUPPORTED_LANGUAGES` (the 10-language list from `TRANSLATION-SPIKE-GO-NO-GO.md`) and `detectLanguage()`, which parses `Accept-Language` by quality order and matches base subtags only — no language-family mapping table anywhere in the file (D-10).
- `src/server/i18n/dir.ts` exports `dirFor()`, returning `'rtl'` for Arabic and `'ltr'` for every other of the 10 confirmed languages.
- `src/lib/i18n/format.ts` exports `formatDigits()`, the single shared ASCII-digit formatting helper called out in `01-RESEARCH.md`'s Don't-Hand-Roll table.
- All 10 locale JSON files authored under `src/lib/i18n/locales/` with an identical 18-key set (17 UI-SPEC Copywriting Contract keys + `languageName` endonym), mechanically verified for key-set parity and non-empty values.

## Task Commits

Each task was committed atomically (Task 1 followed TDD RED → GREEN):

1. **Task 1 (RED): failing tests for detect/dir/format** - `cbcf0f6` (test)
2. **Task 1 (GREEN): detect.ts, dir.ts, format.ts implementation** - `6c4de0a` (feat)
3. **Task 2: author all 10 locale JSON files** - `fd23f15` (feat)

_No REFACTOR commit — the GREEN implementation needed no follow-up cleanup._

## Files Created/Modified

- `src/server/i18n/detect.ts` - `SUPPORTED_LANGUAGES` (10 codes) and `detectLanguage(acceptLanguageHeader, supported)`
- `src/server/i18n/detect.test.ts` - 5 behavior tests (Arabic match, unsupported fallback, no-header fallback, quality-order pick, region-subtag match)
- `src/server/i18n/dir.ts` - `dirFor(languageCode)`
- `src/server/i18n/dir.test.ts` - 3 tests (Arabic rtl, all-others ltr, exactly-one-rtl)
- `src/lib/i18n/format.ts` - `formatDigits(value, locale?)`, always ASCII digits
- `src/lib/i18n/format.test.ts` - 3 tests (plain number, locale argument ignored, no Arabic-Indic/Devanagari leakage)
- `src/lib/i18n/locales/en.json` - authoritative English source-language key set (18 keys)
- `src/lib/i18n/locales/{ar,es,fr,pt,hi,zh,ru,id,sw}.json` - matching translated key sets for the remaining 9 confirmed languages
- `package.json` - `test` script glob extended to include `src/server/i18n/*.test.ts` and `src/lib/i18n/*.test.ts`

## Decisions Made

- Read the confirmed language list directly from `TRANSLATION-SPIKE-GO-NO-GO.md`'s "Final decision" section (owner sign-off: ship all 10, including Swahili) rather than the plan frontmatter's own nine/ten framing, per the executor's explicit instruction.
- Added a `languageName` key (endonym in the language's own script) to every locale file, beyond the 17 literal Copywriting Contract rows, because the plan's action step calls this out by name for Plan 01-09's language sheet (D-09: endonyms, not English names).
- `formatDigits()` ignores its optional `locale` parameter for output purposes (accepted for call-site readability only) and always formats via `'en-US'` with `useGrouping: false` — the simplest implementation that structurally cannot leak Arabic-Indic/Devanagari digits, satisfying the plan's acceptance criterion.

## Deviations from Plan

None - plan executed exactly as written. The plan's own `<read_first>` correctly anticipated the ten-language outcome; no branching logic was needed.

## Issues Encountered

None.

## TDD Gate Compliance

Task 1 (`tdd="true"`) followed the RED → GREEN gate sequence:
1. `cbcf0f6` `test(01-05): ...` — 3 new test files added, all failing (module not found) — confirmed via `node --experimental-strip-types --test`.
2. `6c4de0a` `feat(01-05): ...` — implementation added, all 11 i18n tests passing (5 detect + 3 dir + 3 format).

No REFACTOR commit was needed.

## User Setup Required

None - no external service configuration required. Locale content was hand-authored offline per the plan's instruction (Phase 1 makes zero live translation API calls).

## Next Phase Readiness

- Plans 01-09 (language sheet), 01-10 (visitor chat shell), and 01-11 (admin surface) can now import `detectLanguage`, `dirFor`, `formatDigits`, and every locale JSON file — no component should hardcode an English string going forward.
- **Carried-forward risk (already tracked in STATE.md, not newly introduced here):** Swahili translation quality is unverified in production — the spike scored 75%/67% against the 90% bar before the owner's override. The `sw.json` content authored in this plan is a best-effort hand-authored translation, not spike-validated, and should be checked against real dev/staging per the existing STATE.md blocker before Phase 1 ships.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 13 created files verified present on disk (detect.ts, dir.ts, format.ts, 10 locale JSON files). All 4 commits (cbcf0f6, 6c4de0a, fd23f15, f589665) verified present in git log.
