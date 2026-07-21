---
phase: 02-reachability-and-language
plan: 08
subsystem: ui
tags: [react, nextjs, translation, push, admin-dashboard, sse]

# Dependency graph
requires:
  - phase: 02-reachability-and-language
    provides: "since()/sinceAll()'s OWNER_LANG-joined translation field (02-05), translate-preview.ts + reply.ts's originalBody persistence (02-05), the PUSH-08 ack endpoint (02-06), gateFunnel.statsByPlatform() (02-01)"
provides:
  - "Visitor-side 'See original' toggle on owner replies (MessageBubble.tsx), gated on TRANS-06's same-language skip"
  - "Client-side ACK-on-receipt for PUSH-08's grace-period push suppression (useChatStream.ts)"
  - "Owner composer draft/preview/edit/send state machine (ReplyBox.tsx + reply-composer-logic.ts), D-09's inline-swap UX"
  - "Owner Thread.tsx translated-primary rendering with reveal-original toggle, uniform across both senders (ADMIN-09)"
  - "Admin conversation-list gate-funnel stats row (GateFunnelStats.tsx) and per-row unreachable badge (ConversationRow.tsx), OPS-11/D-18"
affects: [phase-03-admin-inbox]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MessageBubble.tsx's translationPrimary prop lets one component serve two mirrored reveal directions (visitor: primary=body/reveal=translation gated on sender==='owner'; admin: primary=translation??body/reveal=body, both senders) without forking the bidi-isolated rendering block"
    - "reply-composer-logic.ts: pure, framework-free state-transition module extracted from ReplyBox.tsx's JSX, directly node:test-able -- same split precedent as composer-logic.ts (Composer.tsx) and send.ts/reply.ts (next/headers)"

key-files:
  created:
    - src/components/admin/GateFunnelStats.tsx
    - src/components/admin/reply-composer-logic.ts
    - src/components/admin/reply-composer-logic.test.ts
  modified:
    - src/lib/chat/useChatStream.ts
    - src/components/chat/ChatShell.tsx
    - src/components/chat/MessageList.tsx
    - src/app/page.tsx
    - src/components/chat/MessageBubble.tsx
    - src/components/admin/ReplyBox.tsx
    - src/components/admin/Thread.tsx
    - src/app/admin/(auth)/c/[id]/page.tsx
    - src/server/repo/conversations.ts
    - src/components/admin/ConversationRow.tsx
    - src/app/admin/(auth)/page.tsx

key-decisions:
  - "MessageBubble.tsx's toggle direction is inverted between the visitor and admin call sites via one new translationPrimary prop, rather than forking the component -- both directions reuse the identical dir=auto + unicodeBidi:isolate text block"
  - "MessageList.tsx (not in this plan's files_modified list) was additively extended to thread showOriginalLabel/hideOriginalLabel from ChatShell down to MessageBubble -- required for the visitor-side toggle to receive locale-driven copy at all (Rule 2)"
  - "ReplyBox.tsx's Send button is a single persistent element across draft and preview modes (SendHorizontal icon, aria-label always 'Send'), never swapped for a second button -- Preview is a genuinely separate, additional button shown only in draft mode with non-empty text, per the plan's explicit action text"

requirements-completed: [TRANS-04, ADMIN-09, OPS-11, PUSH-08]

coverage:
  - id: D1
    description: "Visitor sees the delivered (translated) text by default on an owner reply and can reveal the owner's original-language draft via a 'See original' toggle; no toggle for same-language/null-translation messages"
    requirement: "TRANS-04"
    verification:
      - kind: unit
        ref: "npm run build (TypeScript + Next build, includes MessageBubble.tsx's gating logic)"
        status: pass
    human_judgment: true
    rationale: "Toggle reveal/hide interaction and bidi rendering correctness across RTL/LTR scripts require visual confirmation in a real browser -- no component test harness exists in this codebase (node:test only, no jsdom/RTL)."
  - id: D2
    description: "The live SSE 'message' event silently ACKs an owner-sent message via POST /api/chat/messages/ack, closing PUSH-08's grace-period loop"
    requirement: "PUSH-08"
    verification:
      - kind: unit
        ref: "src/app/api/chat/messages/ack.test.ts (pre-existing, unmodified -- exercises handleAck's server-side contract this call targets)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Owner can draft, preview (translate), edit the preview, and send with the original preserved exactly when a distinct one exists; a translation failure never blocks sending"
    requirement: "TRANS-04"
    verification:
      - kind: unit
        ref: "src/components/admin/reply-composer-logic.test.ts (11 tests, all passing)"
        status: pass
    human_judgment: true
    rationale: "The pure state machine is fully unit-tested, but the wired ReplyBox.tsx (fetch calls, button states, 'Translating...' bounded transient copy) needs a live browser check against the real translate-preview endpoint."
  - id: D4
    description: "Thread.tsx renders translation-primary text for every message (both senders) with a reveal-original toggle, uniformly per ADMIN-09"
    requirement: "ADMIN-09"
    verification:
      - kind: unit
        ref: "npm run build; src/app/api/admin/messages/reply.test.ts (originalBody persistence this rendering depends on)"
        status: pass
    human_judgment: true
    rationale: "Requires visually confirming a real Swahili-to-English (or similar) conversation renders correctly in both directions -- no browser test harness in this repo."
  - id: D5
    description: "Admin list renders an all-time gate-funnel stats row (Shown/Reached prompt/Granted, split iOS/Other, zero-filled for any absent platform) and a per-row unreachable badge with no new admin screen"
    requirement: "OPS-11"
    verification:
      - kind: unit
        ref: "src/server/repo/gateFunnel.test.ts (pre-existing, unmodified); manual query verified against real local Postgres (listWithPreview returned unreachable:false rows correctly, statsByPlatform returned [] on an empty funnel table)"
        status: pass
    human_judgment: true
    rationale: "Visual layout/copy of the new stats row and badge (D-17/D-18's low-weight styling) needs a real-browser check; the underlying query logic was verified against a live database in this session."

# Metrics
duration: 35min
completed: 2026-07-22
status: complete
---

# Phase 2 Plan 8: Translation UI + Admin Reachability Surfaces Summary

**Both directions of the "owner reads in English, replies shown in Swahili, either side can always see the human's actual words" translation vertical are now on-screen — visitor and owner "See original" toggles, an inline-swap draft-preview-edit-send composer, and the admin list's gate-funnel stats row plus unreachable badge.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-21 (session)
- **Completed:** 2026-07-22T02:39:11+03:00
- **Tasks:** 3 (Task 2 ran RED → GREEN)
- **Files modified:** 14 (11 modified, 3 created)

## Accomplishments
- Visitor-side "See original" toggle on owner replies (MessageBubble.tsx), gated on TRANS-06's same-language skip, reusing the exact bidi-isolation treatment as the primary text
- Client-side fire-and-forget ACK on every live owner-reply SSE event, closing PUSH-08's grace-period loop against the pre-existing `/api/chat/messages/ack` endpoint
- Owner composer draft → preview (translated, editable) → send flow in ReplyBox.tsx, with a pure, fully-tested state machine (`reply-composer-logic.ts`) and a bounded "Translating…"/"Couldn't translate…" fallback
- Owner Thread.tsx renders translation-primary text uniformly for both senders (ADMIN-09), with a reveal-original toggle sharing MessageBubble.tsx via a new `translationPrimary` prop rather than a fork
- Admin conversation list gains a gate-funnel stats row (`GateFunnelStats.tsx`, zero-filled per platform) and a quiet, informational "Unreachable" badge (`ConversationRow.tsx`) — no new admin screen, per D-17/D-18

## Task Commits

Each task was committed atomically:

1. **Task 1: Visitor "See original" — MessageBubble/useChatStream/ChatShell/page.tsx + ACK-on-receipt** - `8057092` (feat)
2. **Task 2: Owner composer draft-preview (ReplyBox.tsx)** - `16e637a` (test, RED) → `bbec613` (feat, GREEN)
3. **Task 3: Owner Thread "See original" + admin list stats/badge** - `ecf9ef8` (feat)

**Plan metadata:** (this commit)

_Note: Task 2 is TDD (`tdd="true"`) — RED (`16e637a`, all 11 tests failing against an intentional stub) then GREEN (`bbec613`, all 11 passing) as required by the plan's gate sequence._

## Files Created/Modified
- `src/components/admin/reply-composer-logic.ts` - Pure draft/preview/edit/send state machine for ReplyBox.tsx
- `src/components/admin/reply-composer-logic.test.ts` - 11 node:test cases covering every D-09/D-10 behavior line
- `src/components/admin/ReplyBox.tsx` - Wires the state machine to translate-preview.ts + reply.ts's originalBody field; Preview/Edit-original/Send-anyway UI
- `src/components/admin/GateFunnelStats.tsx` - New: Shown/Reached prompt/Granted stats row, zero-filled per platform
- `src/lib/chat/useChatStream.ts` - `translation` field on `ChatStreamMessage`; fire-and-forget ACK on live owner-reply events
- `src/components/chat/ChatShell.tsx` - Threads `translation`/toggle labels into `messageListItems`
- `src/components/chat/MessageList.tsx` - Additive: threads `showOriginalLabel`/`hideOriginalLabel` down to MessageBubble
- `src/app/page.tsx` - `initialMessages` now carries `translation` from `since()`
- `src/components/chat/MessageBubble.tsx` - Tap-to-reveal "See original" toggle; new `translationPrimary` prop for Thread.tsx's mirrored reveal direction
- `src/components/admin/Thread.tsx` - Translation-primary rendering for every message via `MessageBubble`'s `translationPrimary`
- `src/app/admin/(auth)/c/[id]/page.tsx` - `translation` added to the server-fetched `messages` mapping
- `src/server/repo/conversations.ts` - `listWithPreview()` gains `unreachable: boolean` (LEFT JOIN `push_gate_funnel` + NOT EXISTS `push_subscriptions`)
- `src/components/admin/ConversationRow.tsx` - Quiet inline `BellOff` "Unreachable" badge, purely informational
- `src/app/admin/(auth)/page.tsx` - Wires `statsByPlatform()` + `<GateFunnelStats>` + `unreachable` passthrough

## Decisions Made
- MessageBubble.tsx's two mirrored reveal directions (visitor: primary=body, admin: primary=translation) share one component via a `translationPrimary` boolean prop rather than forking the bidi-isolated text-rendering block, per the plan's explicit "reuse the component, do not fork it" instruction
- `MessageList.tsx` was additively touched (not in this plan's `files_modified` list) to thread `showOriginalLabel`/`hideOriginalLabel` from `ChatShell` down to `MessageBubble` — without it the visitor-side toggle had no path to receive locale-driven copy (Rule 2, missing critical functionality)
- `ReplyBox.tsx`'s Send button stays a single persistent element (icon-only, `SendHorizontal`, aria-label "Send") across both draft and preview modes; "Preview" is a genuinely separate, additional button visible only in draft mode with non-empty text — resolved a wording tension between the plan's action text ("alongside the existing Send button") and UI-SPEC's "reuses this exact button" phrasing by treating the action text as authoritative for button count and the UI-SPEC line as describing the Send button's own stability across mode changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Additively extended MessageList.tsx to thread toggle-label props**
- **Found during:** Task 1 (visitor "See original" toggle)
- **Issue:** `MessageBubble`'s new `showOriginalLabel`/`hideOriginalLabel` props needed a path from `ChatShell.tsx`'s locale-resolved `strings` down through `MessageList.tsx` to each `MessageBubble` instance; `MessageList.tsx` was not in the plan's `files_modified` list but had no existing prop-threading for this
- **Fix:** Added `showOriginalLabel`/`hideOriginalLabel` to `MessageListProps`, forwarded to each `MessageBubble`
- **Files modified:** `src/components/chat/MessageList.tsx`
- **Verification:** `npm run build` passes; `MessageBubble`'s defaults ("See original"/"Hide original") also match the locale JSON exactly, so even an unthread caller would render correct English copy
- **Committed in:** `8057092` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for the visitor-side toggle to actually receive locale-driven copy end-to-end. No scope creep — the change is a straightforward prop-threading addition matching the file's existing `failedLabel`/`onRetry` forwarding pattern.

## Issues Encountered
- The full `npm test` script initially reported 76 failures when run without `DATABASE_URL` explicitly exported in this shell session (the `.env-file`-loaded value wasn't picked up in one intermediate `export` command). Re-running with `DATABASE_URL` explicitly set resolved all 157 tests to passing — not a real regression, confirmed by isolating the admin-messages test file first.
- `npm run build` requires throwaway VAPID env vars in this session (per the plan's environment note) — generated a fresh dev keypair with `npx web-push generate-vapid-keys` and exported it for both build attempts; not committed anywhere.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2's full translation + reachability vertical (visitor chat, owner dashboard, push gate, admin stats) is now code-complete across all 8 plans (02-01 through 02-08); 02-07's `checkpoint:human-verify` for real iOS hardware remains the one open item blocking Phase 2's final sign-off, unrelated to this plan's scope.
- `npm run build` and the full `node --test` suite (157 tests) both pass with this plan's changes layered on top of 02-01 through 02-07.
- Manual verification still needed (flagged `human_judgment: true` in `coverage` above): a real end-to-end Swahili↔English conversation exercising both toggle directions and the composer's live translate-preview call against the real translation provider.

## Self-Check: PASSED

All 14 created/modified files verified present on disk; all 4 task commits (`16e637a`, `bbec613`, `8057092`, `ecf9ef8`) verified present in git log.

---
*Phase: 02-reachability-and-language*
*Completed: 2026-07-22*
