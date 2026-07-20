---
phase: 01-foundation-and-the-realtime-spine
plan: 10
subsystem: ui
tags: [react, next.js, eventsource, sse, bidi, rtl, tdd]

# Dependency graph
requires:
  - phase: 01-foundation-and-the-realtime-spine (01-08)
    provides: "POST /api/chat/messages ({body, clientMsgId} -> {id, createdAt} idempotent send), GET /api/chat/stream (message/presence SSE events, Last-Event-ID backfill, ~4-minute D-15 recycle)"
provides:
  - "src/components/chat/MessageBubble.tsx -- bidi-isolated message text (dir=auto + unicode-bidi:isolate), exactly two delivery states (sent/failed), icon-allowlist compliant"
  - "src/components/chat/MessageList.tsx -- scroll-anchor-on-bottom transcript renderer"
  - "src/components/chat/Composer.tsx -- grow-to-5-lines textarea, optimistic send, silent bounded auto-retry, failed+tap-to-retry"
  - "src/components/chat/composer-logic.ts -- framework-free, node:test-able state machine behind Composer.tsx (guardSubmit/createOptimisticBubble/sendWithRetry)"
  - "src/lib/chat/useChatStream.ts -- EventSource client, native Last-Event-ID replay, id-based dedup, consecutive-error-gated isReconnecting, POLLING_FALLBACK_ENABLED=false"
affects: ["01-12 (final page wiring: merges MessageList/Composer, attaches a 'presence' listener to useChatStream's exposed EventSource, connects it to usePresence.setPresence)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Framework-free logic split for JSX test-runnability: composer-logic.ts holds Composer.tsx's D-18/D-19/D-20 state machine as plain, dependency-free TypeScript so node:test (--experimental-strip-types, type-stripping only, no JSX transform) can exercise it directly -- the same class of split 01-08-SUMMARY.md documented for next/headers, applied here to JSX instead."
    - "useChatStream.ts owns one EventSource and exposes the raw instance (rather than importing usePresence.ts) so a future caller can attach a 'presence' listener on the same connection without coupling the two hook files together."

key-files:
  created:
    - src/components/chat/MessageBubble.tsx
    - src/components/chat/MessageList.tsx
    - src/components/chat/Composer.tsx
    - src/components/chat/composer-logic.ts
    - src/components/chat/composer-logic.test.ts
    - src/lib/chat/useChatStream.ts
  modified:
    - package.json

key-decisions:
  - "Composer.tsx's optimistic-send/auto-retry/failed-tap-to-retry state machine was extracted into composer-logic.ts (not in the plan's files_modified list) so Task 2's TDD behavior tests are actually runnable -- Composer.tsx is a .tsx file with JSX, and this project's `node --experimental-strip-types --test` runner performs TypeScript type stripping only, not a JSX transform, so it cannot import a .tsx file directly. Mirrors 01-08-SUMMARY.md's send.ts/reply.ts precedent for the identical class of constraint (there: next/headers; here: JSX)."
  - "The 5 behavior tests named in the plan's <behavior> block are expressed against composer-logic.ts's pure functions (guardSubmit, createOptimisticBubble, sendWithRetry) rather than against a rendered Composer.tsx DOM tree, since no DOM/JSX test renderer (jsdom, @testing-library/react) exists in this project's dependencies. Composer.tsx itself wires that tested logic to React state/DOM/fetch; the wiring was verified via `npm run build`'s full TypeScript + Turbopack compile rather than a second test layer."
  - "useChatStream.ts's isReconnecting flips true only once consecutiveErrors exceeds a threshold of 3 (reset to 0 on every successful open/message), rather than never counting a D-15-recycle-driven error at all -- the browser's EventSource API gives no client-visible signal to distinguish 'the server closed this cleanly for a scheduled recycle' from 'the connection genuinely failed', so the practical mechanism for D-17's 'a clean recycle must produce zero UI' is that a single error is immediately superseded by a successful reopen before the counter can cross the threshold."
  - "MessageBubble accepts a 'pending' boolean distinct from 'deliveryState' (\"sent\" | \"failed\") so Composer's 60%-opacity optimistic phase (before the send outcome is known) never introduces a third named delivery state -- pending suppresses the delivery icon entirely rather than rendering a third icon variant, keeping D-20's 'exactly two states' literal."
  - "Composer.tsx renders its own optimistic bubbles locally (via MessageBubble, imported since Task 1 precedes Task 2 within this same plan) rather than requiring MessageList/a parent page to already exist -- keeps the component usable standalone before Plan 01-12's final wiring decides the exact merge-with-confirmed-transcript mechanism."

patterns-established:
  - "Any future .tsx component needing node:test-covered behavior follows the composer-logic.ts split: <name>-logic.ts (pure, testable) + <Name>.tsx (thin React wiring)."

requirements-completed: [CHAT-03, CHAT-04, LANG-04, LANG-05]

coverage:
  - id: D1
    description: "MessageBubble.tsx renders message text with dir=auto + unicode-bidi:isolate on the text node, exactly two delivery-state indicators (Check/sent, RotateCcw/failed, never delivered/seen), and ASCII-digit timestamps via the shared formatDigits helper"
    requirement: "LANG-04"
    verification:
      - kind: other
        ref: "grep: no 'delivered'/'seen' string; dir=\"auto\" present; formatDigits imported and used -- all confirmed via literal grep re-run against final committed HEAD"
        status: pass
      - kind: integration
        ref: "npm run build succeeds (Turbopack + TypeScript pass) with MessageBubble/MessageList compiling cleanly"
        status: pass
    human_judgment: true
    rationale: "Actual grapheme-level bidi rendering for the Arabic-paragraph-with-embedded-URL fixture (RESEARCH.md Pitfall 5) and the 500-character-token/200-character-URL wrap backstop are visual properties that require a rendered browser, which this plan's test tooling (plain node:test, no jsdom/Playwright) cannot exercise -- both are flagged as backstop verification in the plan's must_haves and require human/UAT confirmation."
  - id: D2
    description: "MessageList.tsx auto-scrolls to the newest message on mount and on a new message only when the reader was already at the bottom, tracked via a real scroll listener rather than a post-append recompute"
    requirement: "CHAT-04"
    verification:
      - kind: other
        ref: "grep -c \"isAtBottomRef\" src/components/chat/MessageList.tsx confirms the at-bottom check gates the scroll-to-newest call, not an unconditional scrollIntoView"
        status: pass
    human_judgment: true
    rationale: "Scroll-anchor behavior under real user scroll interaction is a browser-runtime property no automated test in this plan exercises live; verified by code inspection of the effect's conditional logic."
  - id: D3
    description: "Composer.tsx's optimistic-send/silent-bounded-retry/failed-tap-to-retry state machine (composer-logic.ts) -- empty/whitespace-only is a no-op, a bubble is created synchronously before any network resolution, retries are silent and bounded, and a manual tap-to-retry reuses the identical clientMsgId"
    requirement: "CHAT-03"
    verification:
      - kind: unit
        ref: "src/components/chat/composer-logic.test.ts -- 8/8 tests pass via `npm run test` (RED commit c081eba confirmed the module didn't exist; GREEN commit 1609cff)"
        status: pass
    human_judgment: false
  - id: D4
    description: "useChatStream.ts wraps EventSource against /api/chat/stream relying on native Last-Event-ID reconnect (no hand-rolled cursor), dedupes 'message' events by id, gates isReconnecting behind a >1 consecutive-error threshold, exposes the raw EventSource for a future presence listener, and ships POLLING_FALLBACK_ENABLED=false"
    requirement: "CHAT-04"
    verification:
      - kind: other
        ref: "grep -c \"POLLING_FALLBACK_ENABLED\"/\"EventSource\" src/lib/chat/useChatStream.ts both >= 1"
        status: pass
      - kind: integration
        ref: "npm run build succeeds with the hook compiling cleanly (client-only, 'use client')"
        status: pass
    human_judgment: true
    rationale: "Live SSE reconnect behavior (silent D-15 recycle, isReconnecting only after repeated consecutive failures, owner-reply live arrival) requires a running server + real EventSource connection, which this plan's tooling doesn't exercise -- flagged as backstop verification in the plan's must_haves for Plan 01-12/end-of-phase UAT."

# Metrics
duration: ~25min
completed: 2026-07-20
status: complete
---

# Phase 1 Plan 10: Composer, Message List/Bubble, and the EventSource Client Summary

**Optimistic-send/silent-retry/failed-tap-to-retry Composer (state machine in a framework-free, node:test-covered module), bidi-isolated MessageBubble/MessageList, and a native-Last-Event-ID EventSource client hook -- the client half of CHAT-03/CHAT-04/LANG-04/LANG-05.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-20T14:57:32Z (session start)
- **Completed:** 2026-07-20T15:12:50Z (final task commit)
- **Tasks:** 3 completed
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- `MessageBubble.tsx` -- renders message text with `dir="auto"` plus `unicode-bidi: isolate` directly on the text node (independent of the bubble's own ambient direction), so an embedded Latin URL or scripture reference inside an Arabic message stays intact (LANG-04). Visitor-sent bubbles use `--primary`/`--primary-foreground`; owner-sent bubbles use `--muted`/`--foreground`. Exactly two delivery-state indicators exist for the visitor's own outgoing messages -- a `Check` icon (`sent`) or a `RotateCcw` retry icon (`failed`) -- never a third state, never "delivered"/"seen" (D-20). `RotateCcw` is the only mirrored icon in the file (LANG-05 allowlist); timestamps render through the shared `formatDigits` (ASCII digits only, Plan 01-05).
- `MessageList.tsx` -- renders an ordered transcript of `MessageBubble`s, auto-scrolling to the newest message on mount and on a new arrival only when the reader was already scrolled to the bottom (tracked via a real `scroll` listener updated continuously, not a post-append recompute that would always read "not at bottom" the instant a taller message lands).
- `composer-logic.ts` -- the pure, framework-free D-18/D-19/D-20 state machine (`guardSubmit`, `createOptimisticBubble`, `sendWithRetry`) behind `Composer.tsx`, extracted specifically so it is directly `node:test`-able (Composer.tsx is `.tsx`/JSX, which plain `node --experimental-strip-types --test` cannot execute). All 5 of Task 2's specified behaviors, plus 3 supporting tests (8 total), pass -- empty/whitespace-only is a no-op, a `sending`-state bubble is returned synchronously before any network call, retries are silent and bounded (never unbounded -- T-01-31), and a manual tap-to-retry provably reuses the identical `clientMsgId`.
- `Composer.tsx` -- a textarea that grows to a maximum of 5 lines (measured via `scrollHeight`, capped at 120px) then scrolls internally, `pb-[env(safe-area-inset-bottom)]` on the composer bar, and a `SendHorizontal` send button (the one mirrored icon here) that is `--muted-foreground` when empty and accent-colored only when non-empty. On submit: generates a `crypto.randomUUID()` `clientMsgId` once, renders an optimistic bubble immediately at 60% opacity via `MessageBubble`, `POST`s to `/api/chat/messages`, and on success settles that exact bubble to `sent`/100% opacity. On failure, `sendWithRetry` retries the same `clientMsgId` a bounded number of times silently before flipping only that bubble to `failed` with the locale-JSON-sourced `errorSendFailed` copy ("Couldn't send. Tap to try again.") and a tap-to-retry affordance. The composer's input field clears optimistically on submit (the typed text lives on in the bubble itself, not the input, satisfying D-19's "never has to type it twice" via the bubble's own tap-to-retry rather than a repopulated draft).
- `useChatStream.ts` -- wraps the browser's native `EventSource` against `/api/chat/stream`, relying entirely on the platform's built-in Last-Event-ID reconnect behavior (no hand-rolled cursor). Dedupes incoming `message` events by `id` before appending. `isReconnecting` flips true only once consecutive `onerror` events exceed a threshold (reset to 0 on every successful open/message), so the routine ~4-minute D-15 recycle -- which produces exactly one native `error` before a successful reopen -- never crosses the threshold and never surfaces "Reconnecting…" (D-17). Exposes the raw `EventSource` instance rather than importing `usePresence.ts`, so Plan 01-12's page wiring can attach a `presence` listener to the same connection without coupling the two hook files together. `POLLING_FALLBACK_ENABLED` is hardcoded `false` (D-16).
- Full project `npm run build` (Turbopack + TypeScript) succeeds with all new files compiling cleanly; `npm run test` passes 41/41 (33 pre-existing + 8 new).

## Task Commits

Each task was committed atomically:

1. **Task 1: MessageBubble and MessageList** -- `6e1fcfd` (feat)
2. **Task 2: Composer -- optimistic send, auto-retry, failed+tap-to-retry** -- `c081eba` (test, RED) -> `1609cff` (feat, GREEN)
3. **Task 3: useChatStream** -- `e9355cb` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/components/chat/MessageBubble.tsx` -- bidi-isolated message bubble, two delivery states
- `src/components/chat/MessageList.tsx` -- scroll-anchor-on-bottom transcript
- `src/components/chat/Composer.tsx` -- optimistic send / silent retry / failed+tap-to-retry
- `src/components/chat/composer-logic.ts` -- the pure, tested state machine behind Composer.tsx
- `src/components/chat/composer-logic.test.ts` -- 8 behavior tests (RED then GREEN)
- `src/lib/chat/useChatStream.ts` -- EventSource client hook
- `package.json` -- added `src/components/chat/*.test.ts` to the `test` script's glob

## Decisions Made

- Extracted `composer-logic.ts` from `Composer.tsx` so Task 2's TDD behavior tests are actually runnable under this project's plain `node --experimental-strip-types --test` runner, which performs TypeScript type stripping only (no JSX transform) and therefore cannot import a `.tsx` file. This is the same class of test-runnability split 01-08-SUMMARY.md documented for `next/headers` (there: `send.ts`/`reply.ts`), applied here to JSX.
- `isReconnecting` counts every `onerror` (including the one a D-15 recycle produces) but requires the count to exceed a threshold of 3 before surfacing, resetting to 0 on every successful reopen -- there is no client-visible EventSource signal that distinguishes "clean scheduled server close" from "genuine failure," so a single recycle-driven error is guaranteed to be superseded by a successful reopen before it could ever cross the threshold, satisfying D-17's "produces zero UI" in practice.
- `MessageBubble` models the composer's 60%-opacity optimistic phase as a `pending: boolean` prop, orthogonal to `deliveryState: "sent" | "failed"`, rather than a third state name -- keeps D-20's "exactly two states" literal while still allowing the pre-outcome visual.
- Composer renders its own optimistic bubbles locally via `MessageBubble` (imported since Task 1 precedes Task 2 in this same plan) rather than depending on `MessageList` or a parent page -- keeps the component fully self-contained ahead of Plan 01-12's final wiring, which will decide the exact mechanism for merging composer-local optimistic bubbles into the confirmed transcript `MessageList` renders.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted `composer-logic.ts` to make Task 2's TDD tests runnable**
- **Found during:** Task 2 (writing the RED tests)
- **Issue:** `Composer.tsx` is JSX; this project's `node --experimental-strip-types --test` runner (see `package.json`'s `test` script and 01-08-SUMMARY.md's established constraint) only strips TypeScript types, it does not perform a JSX transform, so it cannot import a `.tsx` file directly. No DOM/JSX test renderer (jsdom, `@testing-library/react`) is present in this project's dependencies either.
- **Fix:** Extracted the D-18/D-19/D-20 state machine (`guardSubmit`, `createOptimisticBubble`, `sendWithRetry`) into `composer-logic.ts` -- plain, dependency-free TypeScript, directly `node:test`-able. `Composer.tsx` imports and wires this logic to React state/DOM/fetch. The plan's 5 named behaviors are expressed as tests against these pure functions (plus 3 supporting tests, 8 total); the React wiring itself was verified via `npm run build`'s full TypeScript + Turbopack compile.
- **Files modified:** `src/components/chat/composer-logic.ts` (new), `src/components/chat/composer-logic.test.ts` (new), `src/components/chat/Composer.tsx`, `package.json`
- **Verification:** `npm run test` -- 41/41 pass including all 8 new tests; `npm run build` succeeds.
- **Committed in:** `c081eba` (RED) -> `1609cff` (GREEN)

---

**Total deviations:** 1 auto-fixed (Rule 3 -- blocking test-runnability, same class already established at 01-08).
**Impact on plan:** Necessary to make the plan's own TDD requirement for Task 2 actually executable in this environment. No feature scope, API surface, or component file list changed beyond the plan's own `files_modified` for `Composer.tsx` (the extracted logic module is an implementation detail of that same file's testability, not a new deliverable).

## Issues Encountered

None beyond the documented deviation above.

## Known Stubs

None. Every component renders real, wired behavior (no hardcoded empty arrays flowing to UI, no placeholder/"coming soon" text). The one intentional gap -- Composer's optimistic bubbles are not yet merged with `MessageList`'s confirmed transcript, and `useChatStream`'s `eventSource` is not yet connected to `usePresence` -- is explicit, documented integration work deferred to Plan 01-12 per this plan's own objective ("ready for Plan 01-12's final page wiring"), not an unwired stub within this plan's own deliverables.

## Threat Flags

None. Both threats in this plan's `<threat_model>` were mitigated exactly as specified: T-01-30 (XSS) -- `MessageBubble.tsx` renders `message.body` as a plain JSX text child, no `dangerouslySetInnerHTML` anywhere in `src/components/chat/`. T-01-31 (DoS) -- `Composer`'s retry loop (`sendWithRetry`) is bounded by `COMPOSER_MAX_RETRIES = 3`, never unbounded.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 01-12's page wiring has `MessageList` (accepts a `messages: MessageListItem[]` array with optional `deliveryState`/`pending` per item), `Composer` (self-contained optimistic send, exposes an optional `onSent` callback for merging confirmed sends into a parent transcript), and `useChatStream` (returns `messages`, `isReconnecting`, and the raw `eventSource` for attaching a `presence` listener wired to `usePresence.setPresence`) ready to compose into the full chat shell alongside Plan 01-09's `Header`/`Welcome`/`PresenceLine`/`LanguageSheet`.
- Backstop verification items (bidi grapheme-level rendering under a real browser, the 500-character-token/200-character-URL wrap, live SSE reconnect/D-15-silence/owner-reply-arrival) are flagged `human_judgment: true` in this SUMMARY's `coverage` block for end-of-phase UAT -- consistent with `config.json`'s `human_verify_mode: "end-of-phase"`.
- No blockers.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 6 claimed files found on disk; all 4 claimed commit hashes (`6e1fcfd`, `c081eba`, `1609cff`, `e9355cb`) found in `git log --oneline --all`.
