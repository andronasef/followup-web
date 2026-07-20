---
phase: 01-foundation-and-the-realtime-spine
plan: 09
subsystem: ui
tags: [react, next.js, i18n, rtl, pwa, sse, vaul, lucide-react]

# Dependency graph
requires:
  - phase: 01-foundation-and-the-realtime-spine (01-05)
    provides: "SUPPORTED_LANGUAGES, detectLanguage, dirFor, and all 10 locale JSON files"
  - phase: 01-foundation-and-the-realtime-spine (01-06)
    provides: "PATCH /api/chat/prefs — persists language/appearance overrides into the signed visitor cookie"
  - phase: 01-foundation-and-the-realtime-spine (01-08)
    provides: "GET /api/chat/stream — emits a \"presence\" SSE event ({ isOwnerOnline }) this plan's usePresence.ts is designed to consume"
provides:
  - "src/components/chat/Header.tsx — the two-control header (language + appearance), self-contained PATCH calls"
  - "src/components/chat/Gate.tsx — env-bypassed Phase 1 push-gate shell"
  - "src/components/chat/LanguageSheet.tsx — vaul bottom sheet, endonym rows, 70vh cap"
  - "src/components/chat/Welcome.tsx — two-line client-rendered welcome, presence-aware line 2"
  - "src/components/chat/PresenceLine.tsx — colorless Label-weight status line"
  - "src/lib/chat/usePresence.ts — external-store presence seam (setPresence/usePresence) for Plan 01-10's useChatStream to feed and Plan 01-12 to wire"
  - "src/lib/i18n/strings.ts — shared getStrings(lang) locale lookup"
  - "public/manifest.webmanifest, public/sw.js — hand-written PWA scaffold"
affects: ["01-10-composer-and-message-list (shares usePresence.ts, strings.ts)", "01-12-page-composition (wires Header/Gate/LanguageSheet/Welcome/PresenceLine/usePresence together)"]

tech-stack:
  added: []
  patterns:
    - "src/lib/i18n/strings.ts is a single static-import lookup across all 10 locale JSON files (getStrings(lang)) — the one place every visitor-facing component sources copy from, so no component ever hardcodes an English string"
    - "usePresence.ts uses useSyncExternalStore with a module-level store, not React context or a prop — this lets two independent, non-importing plans (01-09's UI, 01-10's SSE stream owner) share live presence state without either plan modifying the other's files"
    - "Standalone chat components take lang/isDark/open as explicit props (no page composition yet) — Plan 01-12 is the wiring point; every component here compiles and typechecks in isolation"

key-files:
  created:
    - src/components/chat/Header.tsx
    - src/components/chat/Gate.tsx
    - src/components/chat/LanguageSheet.tsx
    - src/components/chat/Welcome.tsx
    - src/components/chat/PresenceLine.tsx
    - src/lib/chat/usePresence.ts
    - src/lib/i18n/strings.ts
    - public/manifest.webmanifest
    - public/sw.js
  modified:
    - next.config.ts
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
  - "Added src/lib/i18n/strings.ts (not in the plan's files_modified) — every one of Header/LanguageSheet/Welcome/PresenceLine needs the same 'resolve the active language's locale JSON' operation; a single shared helper avoids four separate ad-hoc import maps."
  - "usePresence.ts models the SSE-presence seam as a useSyncExternalStore-backed module store (setPresence()/usePresence()) rather than React context, because the plan's own read_first explicitly requires this file and Plan 01-10's useChatStream to connect without either plan importing or modifying the other — a module-level store is the only mechanism that satisfies that constraint."
  - "PresenceLine.tsx reuses the exact same welcomeLine2Online/Offline copy Welcome.tsx shows, per the plan's action text ('the same presence-derived text usePresence exposes') — the two surfaces can never disagree about whether the owner is online."
  - "Header.tsx and LanguageSheet.tsx own their own PATCH /api/chat/prefs fetch calls internally (not delegated to a parent callback) per the plan's explicit action text; they expose onAppearanceChange/onLanguageChange callbacks purely so Plan 01-12's composition can sync <html> class / local lang state after a successful PATCH."

patterns-established:
  - "Icon mirroring is per-icon and additive only (no icon in this plan's component set has an rtl: mirror class) — Languages, Sun/Moon, Check, X are all absent from the UI-SPEC.md allowlist and none was given one, keeping LANG-05's no-blanket-rule prohibition intact by simply never writing the rule."

requirements-completed: [CHAT-02, CHAT-05, CHAT-09, LANG-02, LANG-03, LANG-05, LANG-06]

coverage:
  - id: D1
    description: "Header.tsx renders exactly two 44px controls (language, appearance), each with a locale-sourced aria-label, neither icon carrying an RTL mirror class"
    requirement: "CHAT-09"
    verification:
      - kind: other
        ref: "grep -c aria-label src/components/chat/Header.tsx == 2 (plan's Task 1 <verify> command, run directly)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Gate.tsx bypasses via NEXT_PUBLIC_PUSH_GATE_BYPASS (env-driven, not a hardcoded true) with zero permission-request logic in the bypassed branch"
    verification:
      - kind: other
        ref: "code inspection — isPushGateBypassed reads process.env.NEXT_PUBLIC_PUSH_GATE_BYPASS, not a literal boolean"
        status: pass
    human_judgment: false
  - id: D3
    description: "public/sw.js and public/manifest.webmanifest scaffolded with no next-pwa/Serwist dependency; next.config.ts serves /sw.js with Cache-Control: no-cache"
    verification:
      - kind: other
        ref: "plan's Task 1 <verify> command: grep -RiE next-pwa|serwist public/sw.js (no match) + grep -c no-cache next.config.ts >=1 — run directly, passed"
        status: pass
    human_judgment: false
  - id: D4
    description: "LanguageSheet.tsx lists one row per SUPPORTED_LANGUAGES entry showing its endonym (never an English language name) and PATCHes /api/chat/prefs on selection"
    requirement: "LANG-02"
    verification:
      - kind: other
        ref: "plan's Task 2 <verify> command: grep -E \"Arabic\"|\"Chinese\"|\"Swahili\"|\"Hindi\"|\"Russian\" (no match) + grep -c prefs >=1 — run directly, passed"
        status: pass
    human_judgment: false
  - id: D5
    description: "Welcome.tsx renders exactly two locale-sourced lines with no queue/wait-time/ETA language anywhere; PresenceLine.tsx carries no color/dot tied to online state"
    requirement: "CHAT-02"
    verification:
      - kind: other
        ref: "plan's Task 3 <verify> command: grep -iE queue|wait time|ETA Welcome.tsx PresenceLine.tsx (no match) + grep -c welcomeLine1 >=1 — run directly, passed"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full project build (next build) and the existing 33-test suite both pass unmodified with all new components in the tree"
    verification:
      - kind: unit
        ref: "npm run build — compiled successfully, 0 TypeScript errors; npm run test — 33/33 pass"
        status: pass
    human_judgment: false
  - id: D7
    description: "The first-visit chat canvas is never blank and the owner-offline welcome never disables sending (CHAT-02/CHAT-05, full runtime behavior)"
    requirement: "CHAT-05"
    verification: []
    human_judgment: true
    rationale: "This plan builds Welcome.tsx as a standalone, unconditionally-rendering component (structurally verified: no loading/empty branch exists), but there is no page.tsx composition yet — Plan 01-12 wires Header/Welcome/composer together. The end-to-end 'canvas is never blank, sending is never blocked' behavior can only be observed once that composition exists; deferring to Plan 01-12's own verification/UAT."
  - id: D8
    description: "usePresence.ts's SSE-presence seam (setPresence/usePresence) correctly reflects live owner presence once wired to Plan 01-10's useChatStream"
    verification: []
    human_judgment: true
    rationale: "By design this hook does not own the EventSource — it is an external store waiting for an external caller to invoke setPresence(). Correctness of the seam itself (store update -> re-render) is exercised by React's useSyncExternalStore contract and typechecks cleanly, but the actual 'is the owner online' liveness claim can only be verified once Plan 01-12 connects this hook to Plan 01-10's stream."
  - id: D9
    description: "Ten endonym rows in the language sheet scroll internally within a 70vh cap on a 360x640 viewport with every row still meeting the 44px touch target"
    verification: []
    human_judgment: true
    rationale: "Declared 'backstop' verification in the plan's own frontmatter (must_haves.truths) — requires a real/emulated 360x640 viewport render, which this executor cannot produce without the page composition Plan 01-12 provides. No synthetic evidence generated this session; flagging per the project's insufficient_spec -> human_needed convention rather than silently passing."
  - id: D10
    description: "Both welcome lines clear the fold at 360x640 in Arabic, Hindi, Chinese, Russian, and Spanish"
    verification: []
    human_judgment: true
    rationale: "Declared 'backstop' verification in the plan's frontmatter — requires visual viewport rendering in each of the five longest-expansion scripts, not producible without a browser and the page composition Plan 01-12 builds."
  - id: D11
    description: "Rapidly tapping the appearance toggle multiple times settles on a single consistent final theme state with no flicker or torn UI"
    verification: []
    human_judgment: true
    rationale: "Declared 'backstop' verification in the plan's frontmatter. Header.tsx guards against overlapping PATCH calls with a `pending` state flag (structurally reduces but does not eliminate the risk of a torn UI under rapid taps), but the actual rendered-flicker behavior needs a real browser and is deferred to UAT."

duration: ~20min
completed: 2026-07-20
status: complete
---

# Phase 01 Plan 09: Visitor Chat Shell — Header, Language Sheet, Welcome/Presence, Push-Gate Shell Summary

**Five standalone client components (Header, Gate, LanguageSheet, Welcome, PresenceLine) plus a `useSyncExternalStore`-backed `usePresence` hook and a hand-written PWA scaffold (`manifest.webmanifest`/`sw.js`, no next-pwa/Serwist) — all locale-driven via a new shared `getStrings()` lookup, none wired into `page.tsx` yet (Plan 01-12's job).**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-20
- **Tasks:** 3 completed
- **Files modified:** 20 (9 created, 11 modified)

## Accomplishments

- `Header.tsx` renders exactly two 44×44px controls — a `Languages` icon opening the language sheet and a `Sun`/`Moon` appearance toggle that PATCHes `/api/chat/prefs` directly — with locale-sourced `aria-label`s and no icon in either the mirroring allowlist or given a mirror class (CHAT-09, LANG-05, LANG-06).
- `LanguageSheet.tsx` is a `vaul`-backed bottom sheet capped at 70vh, listing every `SUPPORTED_LANGUAGES` entry by its own endonym (never an English name), selecting a row PATCHes `/api/chat/prefs` and closes the sheet (D-09, LANG-02).
- `Welcome.tsx` renders exactly two client-side lines from locale JSON — a constant warmth line plus a presence-chosen line 2 — with zero queue/wait-time/ETA language anywhere, never a row in `messages` (CHAT-02, CHAT-05, D-05, D-08).
- `PresenceLine.tsx` is plain `--muted-foreground` Label text with no color, no dot, no icon, reusing the exact same presence-derived copy `Welcome.tsx` shows (D-06).
- `usePresence.ts` exposes a `useSyncExternalStore`-backed module store — `setPresence()` for whatever owns the SSE `EventSource` (Plan 01-10) to call, `usePresence()` for consuming components to read — the deliberate seam that lets two plans connect without either importing the other's file (D-07).
- `Gate.tsx`, `public/manifest.webmanifest`, and `public/sw.js` scaffold the Phase 2 push-gate/PWA path: env-bypassed (`NEXT_PUBLIC_PUSH_GATE_BYPASS`), zero permission logic, hand-written service worker with only `skipWaiting`/`clients.claim`, served with `Cache-Control: no-cache` via a new `next.config.ts` `headers()` rule.

## Task Commits

Each task was committed atomically:

1. **Task 1: Header, Gate shell, and PWA scaffold** - `a9b0896` (feat)
2. **Task 2: Language bottom sheet (D-09 endonyms)** - `06664c5` (feat)
3. **Task 3: Welcome, presence status line, and the presence SSE hook** - `62a1270` (feat)

## Files Created/Modified

- `src/components/chat/Header.tsx` - two-control header, self-contained appearance PATCH
- `src/components/chat/Gate.tsx` - env-bypassed Phase 1 push-gate shell
- `src/components/chat/LanguageSheet.tsx` - endonym bottom sheet, 70vh cap, prefs PATCH
- `src/components/chat/Welcome.tsx` - two-line client-rendered welcome
- `src/components/chat/PresenceLine.tsx` - colorless Label-weight status line
- `src/lib/chat/usePresence.ts` - `setPresence`/`usePresence` external-store seam
- `src/lib/i18n/strings.ts` - `getStrings(lang)`, shared locale JSON lookup
- `public/manifest.webmanifest` - PWA manifest scaffold (name/short_name/icons/display/start_url)
- `public/sw.js` - hand-written service worker (`install`/`activate` only)
- `next.config.ts` - added `headers()` rule: `/sw.js` → `Cache-Control: no-cache`
- `src/lib/i18n/locales/{en,ar,es,fr,pt,hi,zh,ru,id,sw}.json` - added `closeAriaLabel` key

## Decisions Made

- Created `src/lib/i18n/strings.ts` as a shared cross-component locale lookup rather than duplicating the same static-import switch in four files.
- Modeled `usePresence.ts` as a `useSyncExternalStore` module store (not context) — the only mechanism that lets this plan's UI and Plan 01-10's SSE-stream owner connect later without either plan's file needing to change.
- `PresenceLine.tsx` deliberately reuses `Welcome.tsx`'s exact `welcomeLine2Online`/`welcomeLine2Offline` copy so the two surfaces can never contradict each other about live owner presence.
- `Header.tsx`/`LanguageSheet.tsx` own their PATCH calls internally, exposing `onAppearanceChange`/`onLanguageChange` callbacks only so Plan 01-12's composition can sync `<html>` class/local state after success — matching the plan's explicit "calls PATCH on click" / "selecting a row calls PATCH" action text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `src/lib/i18n/strings.ts`**
- **Found during:** Task 1 (Header.tsx)
- **Issue:** The plan's `files_modified` list has no shared locale-lookup helper, but every component in this plan (and Task 2/3's LanguageSheet/Welcome/PresenceLine) needs to resolve the active language's locale JSON, and UI-SPEC.md's Copywriting Contract requires "none may be hardcoded in a component."
- **Fix:** Added `src/lib/i18n/strings.ts` exporting `getStrings(lang)`, a static-import lookup across all 10 locale files.
- **Files modified:** `src/lib/i18n/strings.ts` (new)
- **Verification:** `npx tsc --noEmit` clean; `npm run build` compiled successfully with all four consuming components importing it.
- **Committed in:** `a9b0896` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added `closeAriaLabel` to all 10 locale JSON files**
- **Found during:** Task 2 (LanguageSheet.tsx)
- **Issue:** The sheet's close (`X`) button needs a locale-sourced `aria-label` (UI-SPEC.md's Copywriting Contract forbids hardcoded strings), but none of the 18 existing locale keys covers "Close" — Plan 01-05's Copywriting Contract enumeration didn't include this control.
- **Fix:** Added a `closeAriaLabel` key (translated per language, e.g. "Close" / "إغلاق" / "关闭") to all 10 locale JSON files.
- **Files modified:** `src/lib/i18n/locales/{en,ar,es,fr,pt,hi,zh,ru,id,sw}.json`
- **Verification:** All 10 files remain valid JSON; `LanguageSheet.tsx`'s close button sources `strings.closeAriaLabel` with no hardcoded fallback.
- **Committed in:** `06664c5` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical i18n/shared-code infrastructure the plan's file list didn't anticipate but its own copy/no-hardcoded-string requirements needed).
**Impact on plan:** Both necessary to make the plan's own accessibility and i18n requirements achievable; no scope creep beyond locale plumbing.

## Issues Encountered

- Initial `public/sw.js` comment text contained the literal substrings "next-pwa" and "Serwist" while explaining why they weren't used — this tripped the plan's own `<verify>` grep (`! grep -RiE "next-pwa|serwist" public/sw.js`), which correctly can't distinguish "doesn't use X" prose from an actual import. Reworded the comment to avoid the literal package names; verify command then passed. No functional code change.
- `npx tsc --noEmit -p tsconfig.json` fails project-wide on a pre-existing `TS5101` `baseUrl`-deprecated warning unrelated to this plan's files (tsconfig.json untouched). Confirmed out of scope (Scope Boundary rule) and worked around locally with `--ignoreDeprecations 6.0` for validation only — not applied to the checked-in `tsconfig.json`. `next build`'s own TypeScript pass (which the project actually ships against) compiled cleanly with zero errors.

## Known Stubs

- `public/manifest.webmanifest` references `/icon-192.png` and `/icon-512.png`, neither of which exists in `public/` yet — no icon-asset-authoring task was in this plan's scope, and the plan's own `<read_first>` scopes icon creation to "the fields Phase 2's iOS Add-to-Home-Screen flow needs, scaffolded now" (fields, not final binary assets). Phase 2 must add real icon files before the guided iOS "Add to Home Screen" flow (CLAUDE.md) can function — the manifest will 404 on those two URLs until then. This does not block Phase 1 (the push gate is bypassed) but is flagged so Phase 2 planning doesn't rediscover it from scratch.

## User Setup Required

None - no external service configuration required. `NEXT_PUBLIC_PUSH_GATE_BYPASS` has a safe default (bypassed/on) and does not need to be set for Phase 1.

## Next Phase Readiness

- Plan 01-10 (composer/message list) can now import `src/lib/chat/usePresence.ts`'s `setPresence()` from wherever it builds `useChatStream`, and `src/lib/i18n/strings.ts`'s `getStrings()` for its own locale-sourced copy — both are stable, typed, and already exercised by a clean `next build`.
- Plan 01-12 (final page composition) has five ready-to-import components (`Header`, `Gate`, `LanguageSheet`, `Welcome`, `PresenceLine`) with explicit prop contracts (`lang`, `isDark`/`open`, and PATCH-success callbacks) — none require modification, only composition into `page.tsx` alongside Plan 01-10's composer/message-list and `useChatStream`.
- **Carried-forward gap (new, not previously tracked):** `public/manifest.webmanifest`'s icon references are placeholders — see Known Stubs above. Phase 2 should add the actual `icon-192.png`/`icon-512.png` files before wiring the iOS install flow.
- **Backstop items requiring human/browser verification before this phase's UAT closes** (D9–D11 in `coverage` above): the 70vh language-sheet scroll at 360×640, welcome-line fold clearance across Arabic/Hindi/Chinese/Russian/Spanish, and appearance-toggle rapid-tap stability. None are blocked on more code — all three need Plan 01-12's page composition to exist before they're observable in a real viewport.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-20*
