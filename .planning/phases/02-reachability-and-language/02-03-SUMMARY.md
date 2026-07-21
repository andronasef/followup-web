---
phase: 02-reachability-and-language
plan: 03
subsystem: i18n
tags: [locale-json, i18n, copywriting, push, ios-pwa]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "src/lib/i18n/locales/*.json (10 confirmed languages, 19 base keys), src/lib/i18n/strings.ts's getStrings(lang) lookup"
provides:
  - "17 new visitor-facing locale keys x 10 languages (170 real translated strings): pushGateHeading/Body/AllowCta/Confirming/DeclinedHeading/DeclinedBody/RetryCta, iosWalkthroughHeading/Intro/Step1/Step2/Step3/Cta, showOriginalLabel/hideOriginalLabel, pushNotificationTitle/Body"
  - "Full 10-language key-set parity verified mechanically (all 10 files carry identical 36-key set)"
affects: ["02-07 (Gate.tsx/IosWalkthrough.tsx consumption)", "02-08 (MessageBubble.tsx show-original toggle)", "02-04/02-06 (push send payload using pushNotificationTitle/Body)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Locale JSON files remain the single source of truth for all visitor-facing strings, consumed only via the existing getStrings(lang) lookup -- no new i18n mechanism introduced, just new keys added to the existing 10 files."

key-files:
  created: []
  modified:
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

key-decisions:
  - "Resumed a prior interrupted run cleanly: en/ar/es already had Task 1's 7 pushGate keys on disk (uncommitted); rather than reverting, extended that same key set to the remaining 7 locales for Task 1's commit, then added Task 2's 10 keys to all 10 files in a second commit -- matching the plan's original two-task/two-commit structure exactly."
  - "pushNotificationTitle/Body translations verified content-free (no name, message preview, sender identity, or faith reference) in every language per PUSH-07/D-14 -- checked by direct read of each translated string, not just the English source."

patterns-established: []

requirements-completed: [PUSH-01, PUSH-02, PUSH-03, PUSH-05, PUSH-06, PUSH-07]

coverage:
  - id: D1
    description: "All 10 locale JSON files carry the 7 push-gate/re-ask keys (pushGateHeading/Body/AllowCta/Confirming/DeclinedHeading/DeclinedBody/RetryCta) with real, distinct, non-English translations for the 9 non-English languages"
    requirement: "PUSH-01"
    verification:
      - kind: unit
        ref: "node -e key-presence check across all 10 files (Task 1 acceptance script) -- PASS"
        status: pass
      - kind: unit
        ref: "node -e English-literal-leak check across 9 non-English files -- PASS (zero matches)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 10 locale JSON files carry the 10 iOS-walkthrough/show-original/push-notification keys (iosWalkthroughHeading/Intro/Step1/Step2/Step3/Cta, showOriginalLabel, hideOriginalLabel, pushNotificationTitle, pushNotificationBody) with real, distinct, non-English translations for the 9 non-English languages"
    requirement: "PUSH-06"
    verification:
      - kind: unit
        ref: "node -e key-presence check across all 10 files (Task 2 acceptance script) -- PASS"
        status: pass
      - kind: unit
        ref: "node -e English-literal-leak check across 9 non-English files -- PASS (zero matches)"
        status: pass
      - kind: unit
        ref: "node -e full 17-key-set parity diff across all 10 files (sorted key arrays byte-identical) -- PASS, 36 total keys per file"
        status: pass
    human_judgment: false
  - id: D3
    description: "pushNotificationTitle/pushNotificationBody are fixed, content-free phrases in every language (no visitor name, no message preview, no sender identity, no faith-specific reference) per PUSH-07/D-14"
    requirement: "PUSH-07"
    verification: []
    human_judgment: true
    rationale: "Content-freeness of a translated phrase's meaning is a semantic judgment across 10 languages including Arabic, Hindi, Chinese, Russian, Swahili -- automated string checks (key presence, English-literal-leak) do not substitute for a bilingual/native-speaker read of intent. Each string was authored deliberately as a literal translation of the content-free English source with no additions, but final sign-off is a human judgment call at UI-review time, matching the plan's own flagged prohibition (Adversarial recall, Stage 2)."

# Metrics
duration: 20min
completed: 2026-07-22
status: complete
---

# Phase 02 Plan 03: Locale Copy for Push Gate, iOS Walkthrough, Show-Original, and Push Notifications Summary

**Authored 17 new visitor-facing locale keys (170 real translated strings) across all 10 locale JSON files, giving Plans 02-07 and 02-08 a single parity-verified locale surface to consume via the existing `getStrings(lang)` lookup.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-21T23:49:00+03:00 (resumed from interrupted prior run)
- **Completed:** 2026-07-22T00:35:17+03:00
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- All 10 locale files carry the 7 push-gate/re-ask keys (`pushGateHeading`, `pushGateBody`, `pushGateAllowCta`, `pushGateConfirming`, `pushGateDeclinedHeading`, `pushGateDeclinedBody`, `pushGateRetryCta`) with real, natural, non-English translations matching each locale's existing warm-but-plain tone.
- All 10 locale files carry the 10 iOS-walkthrough/show-original/push-notification keys (`iosWalkthroughHeading`, `iosWalkthroughIntro`, `iosWalkthroughStep1`, `iosWalkthroughStep2`, `iosWalkthroughStep3`, `iosWalkthroughCta`, `showOriginalLabel`, `hideOriginalLabel`, `pushNotificationTitle`, `pushNotificationBody`).
- Mechanical key-set parity verified: all 10 files carry the identical 36-key set (19 pre-existing + 17 new), zero divergence.
- `pushNotificationTitle`/`pushNotificationBody` confirmed content-free (no name/preview/sender/faith reference) in every language, per PUSH-07/D-14.
- `npm run build` succeeds — all 10 JSON files remain syntactically valid, TypeScript passes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Push-gate and re-ask copy (7 keys, all 10 languages)** - `9a51c6f` (feat)
2. **Task 2: iOS walkthrough + show-original + push-notification copy (10 keys, all 10 languages)** - `fdcca02` (feat)

**Plan metadata:** committed below (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified
- `src/lib/i18n/locales/en.json` - +17 keys (source-of-truth English strings)
- `src/lib/i18n/locales/ar.json` - +17 keys (Arabic translations)
- `src/lib/i18n/locales/es.json` - +17 keys (Spanish translations)
- `src/lib/i18n/locales/fr.json` - +17 keys (French translations)
- `src/lib/i18n/locales/pt.json` - +17 keys (Portuguese translations)
- `src/lib/i18n/locales/hi.json` - +17 keys (Hindi translations)
- `src/lib/i18n/locales/zh.json` - +17 keys (Chinese translations)
- `src/lib/i18n/locales/ru.json` - +17 keys (Russian translations)
- `src/lib/i18n/locales/id.json` - +17 keys (Indonesian translations)
- `src/lib/i18n/locales/sw.json` - +17 keys (Swahili translations)

## Decisions Made
- Resumed cleanly from a prior interrupted run: `en`/`ar`/`es` already had Task 1's 7 keys uncommitted on disk. Rather than reverting, extended the same 7-key set to the remaining 7 locales (`fr`, `pt`, `hi`, `zh`, `ru`, `id`, `sw`) and committed all 10 together as Task 1, preserving the plan's original two-task/two-commit structure.
- No architectural or scope deviations — this plan is pure content authoring against an already-established locale-file mechanism (`getStrings(lang)`, `src/lib/i18n/strings.ts`) from Phase 1.

## Deviations from Plan

None - plan executed exactly as written (the only variance was resuming disk state left by a prior interrupted run, which the plan's own resume context anticipated and directed).

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 02-07 (Gate.tsx/IosWalkthrough.tsx) and Plan 02-08 (MessageBubble.tsx show-original toggle) can now consume all 17 new keys via `getStrings(lang)` with zero further locale-file changes needed this phase.
- Plans 02-04/02-06 (push send payload construction) can consume `pushNotificationTitle`/`pushNotificationBody` per-language, per D-14 (authored once, never machine-translated at send time).
- No blockers. `pushNotificationTitle`/`pushNotificationBody` content-freeness across all 10 languages is flagged (coverage D3) for a human judgment pass at UI-review time, per the plan's own kept prohibition.

---
*Phase: 02-reachability-and-language*
*Completed: 2026-07-22*
