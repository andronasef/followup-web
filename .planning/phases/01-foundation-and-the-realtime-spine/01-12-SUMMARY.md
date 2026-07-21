---
phase: 01-foundation-and-the-realtime-spine
plan: 12
subsystem: ui
tags: [react, next.js, sse, server-components, client-boundary]

# Dependency graph
requires:
  - phase: 01-foundation-and-the-realtime-spine (01-09)
    provides: "Header, Gate, LanguageSheet, Welcome, PresenceLine, usePresence.ts (setPresence/usePresence external store)"
  - phase: 01-foundation-and-the-realtime-spine (01-10)
    provides: "MessageBubble, MessageList, Composer, composer-logic.ts, useChatStream.ts (exposes raw EventSource)"
  - phase: 01-foundation-and-the-realtime-spine (01-06)
    provides: "requireVisitor() -- visitor identity + open-conversation resolution"
provides:
  - "src/app/page.tsx -- the one public route (CHAT-01), Server Component, server-side repo.messages.since() initial history fetch"
  - "src/components/chat/ChatShell.tsx -- the client boundary composing Gate/Header/LanguageSheet/Welcome/PresenceLine/MessageList/Composer around one useChatStream() call, wiring its 'presence' event into usePresence.setPresence"
affects: ["01-13 (Docker/deploy -- this is the last UI wiring plan before deploy)"]

tech-stack:
  added: []
  patterns:
    - "Server Component page.tsx fetches data (requireVisitor + repo.messages.since) and hands it as props to a 'use client' boundary component that owns all hooks -- identical split already established by Plan 01-11's admin thread page (page.tsx -> Thread.tsx). Necessary because React Server Components cannot call hooks (useState/useEffect/useChatStream), so the plan's own 'Server Component' + 'instantiate useChatStream()' requirements can only both be satisfied via this split, not literally inside one file."
    - "Composer's own local optimistic bubbles are hidden once their clientMsgId appears in the SSE-confirmed transcript (via a new confirmedClientMsgIds prop), rather than merging/deduping message objects -- avoids rendering a just-sent message twice, since the visitor's own SSE connection echoes their own sends back through the same per-conversation hub subscription."
    - "The merged message list switches entirely from server-fetched initialMessages to useChatStream's own messages array once the hook's first Last-Event-ID backfill lands (which always replays full history from id 0 on a brand-new connection) -- never concatenates, avoiding a duplicate render of history."

key-files:
  created:
    - src/components/chat/ChatShell.tsx
  modified:
    - src/app/page.tsx
    - src/components/chat/Composer.tsx

key-decisions:
  - "Added src/components/chat/ChatShell.tsx as a new 'use client' file, even though the plan's files_modified lists only src/app/page.tsx (Rule 3 -- blocking issue). The task's own action text requires page.tsx to be BOTH a Server Component (for the server-side history fetch) AND the place useChatStream() is instantiated -- React Server Components cannot call hooks, so these two requirements are mutually exclusive within one file. The plan's own <verify> grep (checked literally against src/app/page.tsx) cannot pass under any implementation that also satisfies 'Server Component' -- resolved by following the identical, already-approved Server/Client split this same codebase uses one plan earlier (01-11's admin thread page.tsx -> Thread.tsx)."
  - "Added an optional confirmedClientMsgIds prop to Composer.tsx (not in the plan's files_modified) so a locally-optimistic bubble hides once its clientMsgId is visible in the shared transcript -- without this, every visitor-sent message would render twice permanently (once as Composer's own never-removed bubble, once as the durable row the visitor's own SSE connection echoes back). This exact gap was flagged as deferred, explicit integration work in 01-10-SUMMARY.md's 'Known Stubs' section, assigned to this plan."
  - "The confirmed-transcript switch (initialMessages -> liveMessages) is a full replace, not a concat+dedup-by-id list, because useChatStream's first backfill on a brand-new connection always replays the entire history from id 0 (chat/stream/route.ts sends no Last-Event-ID header on first connect) -- concatenating would double-render every historical message the instant the SSE backfill landed."
  - "isDark state resolves 'system' appearance client-side in a useEffect after mount (matching layout.tsx/pre-paint.ts's own documented 'system cannot be server-determined' constraint) rather than attempting a server guess -- one-time icon correction after hydration, consistent with the existing pre-paint.ts pattern for the <html> class itself."

patterns-established:
  - "Any future Server Component page needing hook-driven client behavior (SSE, local state) follows the ChatShell.tsx split: <Page>.tsx (Server Component, data fetch only) + <Name>Shell.tsx / equivalent client component (owns all hooks, receives fetched data as props)."

requirements-completed: [CHAT-01, CHAT-08]

coverage:
  - id: D1
    description: "Visiting / with no cookie renders the full-screen chat directly, no redirect, no intermediate route (CHAT-01)"
    requirement: "CHAT-01"
    verification:
      - kind: integration
        ref: "curl -sS -D - http://localhost:3000/ against a running npm run dev -- HTTP/1.1 200 OK, no Location/redirect header, body contains the rendered Header/Welcome/Composer HTML directly"
        status: pass
    human_judgment: false
  - id: D2
    description: "A returning visitor (valid signed cookie) sees prior message history rendered on load, never a fresh empty conversation (CHAT-08, page-composition half)"
    requirement: "CHAT-08"
    verification:
      - kind: integration
        ref: "curl cookie-jar flow: bootstrap visitor -> POST /api/chat/messages ('Hello from smoke test') -> reload GET / with the same cookie -- the sent message's exact text appears exactly once (grep -oE '>Hello from smoke test<' == 1 match) in the server-rendered HTML, confirming SSR history renders before any client JS runs"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every component from Plans 01-09/01-10 (Gate, Header, LanguageSheet, Welcome, PresenceLine, MessageList, Composer) composes into one page in the UI-SPEC.md order"
    verification:
      - kind: other
        ref: "grep across src/app/page.tsx + src/components/chat/ChatShell.tsx (the actual composition, since page.tsx alone cannot contain hook-driven JSX -- see key-decisions) finds all 7 component names; rendered HTML confirms header (2 controls), welcome (2 lines), message list, composer in that order"
        status: pass
    human_judgment: false
  - id: D4
    description: "usePresence (01-09) and useChatStream (01-10) share one EventSource -- this page never opens two SSE connections for one visitor"
    verification:
      - kind: other
        ref: "grep -n 'useChatStream(' src/components/chat/ChatShell.tsx shows exactly one real call site (two other matches are comments); the 'presence' listener is attached to that same hook's returned eventSource instance, never a second 'new EventSource(...)' call anywhere in the composition"
        status: pass
      - kind: integration
        ref: "curl --max-time 3 http://localhost:3000/api/chat/stream (visitor cookie) returns exactly one 'presence' event followed by 'message' backfill events on the single connection"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full project build and test suite both pass unmodified with the composed page in the tree"
    verification:
      - kind: unit
        ref: "npm run build -- compiled successfully, 0 TypeScript errors, / registered as ƒ (Dynamic); npm run test -- 41/41 pass"
        status: pass
    human_judgment: false
  - id: D6
    description: "The composed page renders correctly and hydrates without a crash in a real browser (not just curl/SSR)"
    verification:
      - kind: integration
        ref: "The dev server's own log captured real, unsolicited browser traffic during this session (7x PATCH /api/chat/prefs 200, multiple GET /api/chat/stream 200 SSE connections, a '[browser] A tree hydrated...' diagnostic) -- no 500s, no crash, no uncaught-exception log lines anywhere in the session"
        status: pass
    human_judgment: true
    rationale: "This executor drove its own verification via curl (which does not execute JS or hydrate) and observed, rather than directly drove, the one real-browser session that hit the dev server during this session. The one hydration note logged (<html> className '' vs 'dark' for appearance='system') is a pre-existing, already-documented trade-off in pre-paint.ts (Plan 01-06, predates this plan) -- 'system' cannot be server-resolved, so the pre-paint script corrects <html>'s class before paint, which necessarily produces this attribute diff on hydrate. React's own message confirms 'This won't be patched up' (client value wins, no revert) -- exactly the intended behavior, not a regression this plan introduced. Full interactive verification (tapping through the language sheet, watching the appearance icon settle, confirming zero visible flicker) still benefits from a dedicated human UAT pass per config.json's end-of-phase human_verify_mode.

# Metrics
duration: ~45min
completed: 2026-07-21
status: complete
---

# Phase 01 Plan 12: Visitor Chat Page Composition Summary

**Server Component `page.tsx` (requireVisitor + server-side `repo.messages.since` history fetch) handing off to a new client boundary `ChatShell.tsx` that instantiates `useChatStream()` exactly once, wires its `presence` event into `usePresence`, and dedupes Composer's own optimistic bubbles against the SSE-confirmed transcript by `clientMsgId` -- CHAT-01's "straight into the chat" and CHAT-08's page-composition half.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-07-21
- **Tasks:** 2 completed
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `src/app/page.tsx` -- rewritten as a Server Component: calls `requireVisitor({ allowCookieWrite: false })` (the same safe-render-only pattern `layout.tsx` already uses -- a Server Component render cannot call `cookies().set()`), resolves/validates the visitor's language against `SUPPORTED_LANGUAGES`, and server-side fetches the visitor's full message history via `repo.messages.since(conversationId, 0)` -- the exact same query the SSE Last-Event-ID backfill and the admin thread page already use -- scoped exclusively to the `requireVisitor()`-resolved conversation id (T-01-34: never a query param or other client-suppliable input, so one visitor's page can never render another's history). Supersedes Plan 01-01's `<h1>One Chat</h1>` placeholder.
- `src/components/chat/ChatShell.tsx` (new) -- the client boundary this task's own action text calls for. Composes, top to bottom: `Gate` (wrapping everything), `Header` (opens `LanguageSheet`), `Welcome` + `PresenceLine`, `MessageList` (seeded with server-fetched history, switching over to `useChatStream`'s own array once its first backfill lands), a quiet `errorReconnectStuck` label when `isReconnecting`, and `Composer` pinned at the bottom. Instantiates `useChatStream()` exactly once and attaches a `presence` listener to its raw `eventSource`, forwarding `{ isOwnerOnline }` into `usePresence`'s `setPresence()` -- the literal seam both 01-09 and 01-10 built for but left unconnected (both plans' SUMMARY.md "Next Phase Readiness" name this exact wiring as Plan 01-12's job).
- `src/components/chat/Composer.tsx` -- added an optional `confirmedClientMsgIds: ReadonlySet<string>` prop. `ChatShell` derives this set from every `clientMsgId` present in the current confirmed transcript and passes it down; Composer filters its own locally-owned optimistic bubbles against it before rendering. Without this, a visitor's own sent message would render twice forever (once as Composer's own bubble -- which never gets removed on success -- once as the durable row the visitor's own SSE connection echoes back, since the hub pushes every conversation event to every subscriber of that conversation, including the sender). This exact gap was flagged as deferred, explicit work in 01-10-SUMMARY.md's "Known Stubs" section.
- Full `npm run build` (Turbopack + TypeScript) compiles cleanly, `/` registers as `ƒ (Dynamic)`; `npm run test` passes 41/41 unchanged.
- Manual smoke test against a real running `npm run dev` + Postgres stack (curl-based, cookie-jar-driven): fresh no-cookie `GET /` returns 200 with the full chat rendered directly (no redirect); exactly 2 header controls (`aria-label="Change language"`, `aria-label="Switch to dark appearance"`); Welcome's 2 lines and PresenceLine both render the correct offline copy by default; bootstrapping a visitor, sending a message, and reloading with the same cookie shows that message exactly once in the server-rendered HTML (history persistence, CHAT-08); `GET /api/chat/stream` with the visitor cookie emits one `presence` event followed by `message` backfill events on a single connection. The dev server's log additionally captured real, unsolicited browser traffic during this session (7 successful `PATCH /api/chat/prefs` round-trips, multiple SSE stream connections) with no crash and no uncaught exceptions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Compose the visitor chat page** -- `e8d2c5b` (feat)
2. **Task 2: Verify the composed page against a running dev stack** -- verification only, no additional code changes were required (the composition worked correctly on first smoke test); folded into this plan's final metadata commit per the task_commit_protocol (no separate commit needed when a task produces no file changes).

## Files Created/Modified

- `src/app/page.tsx` -- Server Component: `requireVisitor` + `repo.messages.since` initial history fetch, renders `ChatShell`
- `src/components/chat/ChatShell.tsx` -- the client boundary: `Gate`/`Header`/`LanguageSheet`/`Welcome`/`PresenceLine`/`MessageList`/`Composer` composition, one `useChatStream()` call, presence-event wiring
- `src/components/chat/Composer.tsx` -- added `confirmedClientMsgIds` prop to prevent duplicate rendering of a visitor's own just-sent message

## Decisions Made

- Split the composition across `page.tsx` (Server Component, data-fetch only) and a new `ChatShell.tsx` (client boundary, all hooks) -- the only way to satisfy this task's own requirement that page.tsx be a Server Component AND that `useChatStream()` be instantiated at "this composition level," since React Server Components cannot call hooks. Followed the identical, already-established precedent from Plan 01-11's admin thread page (`page.tsx` -> `Thread.tsx`).
- Resolved the Composer/MessageList duplicate-message gap (deferred by 01-10) via a `confirmedClientMsgIds` set derived from the live transcript, rather than merging message objects into one shared list -- keeps Composer's self-contained optimistic-send behavior untouched for any standalone usage (prop is optional, default `undefined` preserves prior behavior).
- The confirmed transcript is a full switch-over (`liveMessages.length > 0 ? liveMessages : initialMessages`), not a concat-and-dedup, because `useChatStream`'s first backfill on a brand-new connection always replays the complete history from id 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `src/components/chat/ChatShell.tsx` as the required client boundary**
- **Found during:** Task 1
- **Issue:** The plan's `files_modified` lists only `src/app/page.tsx`, and its own `<verify>` command greps literally against that one file for `useChatStream(` and the component names. But the same task's action text requires `page.tsx` to be a Server Component (for the server-side history fetch) while ALSO being "the place both Plan 01-09's and Plan 01-10's hooks are connected" via a direct `useChatStream()` call -- React Server Components cannot call hooks, so both requirements cannot be satisfied inside one file under any implementation. The plan's own action text anticipates this, explicitly saying to "Render a client boundary composing..." as a distinct step from the Server Component itself.
- **Fix:** Added `src/components/chat/ChatShell.tsx` (`"use client"`), following the identical Server/Client split this same codebase already uses one plan earlier (01-11's `src/app/admin/(auth)/c/[id]/page.tsx` -> `Thread.tsx`). `page.tsx` fetches data server-side and renders `<ChatShell initialLang initialAppearance initialMessages />`; `ChatShell.tsx` owns the one `useChatStream()` call and all component composition.
- **Files modified:** `src/components/chat/ChatShell.tsx` (new)
- **Verification:** Re-ran the plan's verify intent across the actual composition (`page.tsx` + `ChatShell.tsx` combined) instead of `page.tsx` alone: `grep -n "useChatStream("` shows exactly one real call site; `grep -ohE "Gate|Header|LanguageSheet|Welcome|PresenceLine|MessageList|Composer"` across both files finds all 7 names. `npm run build`/`npm run test` both pass.
- **Committed in:** `e8d2c5b` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added `confirmedClientMsgIds` prop to `Composer.tsx`**
- **Found during:** Task 1 (composing `ChatShell.tsx`, tracing what happens to a visitor's own sent message)
- **Issue:** `Composer.tsx` (Plan 01-10) never removes a bubble from its own local state once it settles to `sent` -- and the visitor's own conversation is subscribed to its own SSE hub events, so their own just-sent message is echoed straight back through `useChatStream`'s `messages` array. Composing both components together as literally built would render every visitor-sent message twice, permanently. 01-10-SUMMARY.md's "Known Stubs" section explicitly flagged this exact gap as deferred integration work for this plan.
- **Fix:** Added an optional `confirmedClientMsgIds?: ReadonlySet<string>` prop to `Composer.tsx`; `ChatShell` derives it from the current transcript's `clientMsgId` values and passes it down, filtering out any bubble Composer would otherwise still render locally once the durable row is visible elsewhere. Absent/undefined by default, so Composer's standalone (non-`ChatShell`) behavior is unchanged.
- **Files modified:** `src/components/chat/Composer.tsx`
- **Verification:** Manual smoke test confirmed a sent message ("Hello from smoke test") appears exactly once in the composed page's rendered output; `npm run build`/`npm run test` both pass with the added prop.
- **Committed in:** `e8d2c5b` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (Rule 3 -- a technically-necessary Server/Client split the plan's own action text called for but its file list/verify command didn't fully anticipate; Rule 2 -- a correctness gap explicitly deferred to this plan by 01-10-SUMMARY.md).
**Impact on plan:** Both necessary for the composition to work at all / to work without a visible duplicate-message bug; no scope creep beyond what these two plans (01-10, and this plan's own action text) already called for.

## Issues Encountered

- `.planning/ROADMAP.md` had picked up the same non-ASCII tool-glitch corruption reported earlier in this run (a stray "cd" injected into the Phase 3 table row) before this plan's work began. Discarded via `git checkout -- .planning/ROADMAP.md` per the standing instruction for this run, and the roadmap update for this plan was redone cleanly via `gsd-tools query roadmap.update-plan-progress`.
- A concurrent, unsolicited real-browser session hit the dev server this executor started for its own curl-based smoke test (visible in the dev server's own log: 7x successful `PATCH /api/chat/prefs`, multiple SSE stream connections, one hydration diagnostic). This executor did not drive that session directly but observed its output as corroborating evidence -- see Coverage D6.
- One benign hydration note was logged by that real-browser session: `<html>` `className=""` (server) vs `className="dark"` (client) for a brand-new visitor whose appearance defaults to `"system"`. This is pre-existing, already-documented behavior from `src/app/pre-paint.ts` (Plan 01-06, predates this plan) -- `'system'` cannot be resolved server-side, so the pre-paint script corrects `<html>`'s class before first paint, which necessarily diverges from the server-rendered class attribute on hydrate. React's own message confirms "This won't be patched up" (the client's corrected value is kept, not reverted) -- the intended outcome, not a regression. Out of scope per the Scope Boundary rule (caused by pre-existing `layout.tsx`/`pre-paint.ts`, not this plan's files) -- flagged here rather than silently ignored, not auto-fixed.

## Known Stubs

None. Every component in the composition renders real, wired behavior sourced from the actual visitor session (cookie-resolved language/appearance/conversation, server-fetched history, live SSE messages/presence). No hardcoded empty arrays or placeholder copy was introduced.

## User Setup Required

None -- no external service configuration required. The existing `.env.local` (`DATABASE_URL`, `SESSION_SECRET`, etc., already configured by prior plans) was sufficient for the full smoke test.

## Next Phase Readiness

- CHAT-01 and the page-composition half of CHAT-08 are now satisfied end-to-end against a real running stack, not just unit-tested components in isolation.
- Plan 01-13 (Docker/deploy) can build on a fully wired, manually smoke-tested root page -- no known composition-level gaps remain.
- **Carried-forward, out-of-scope observation (not a blocker):** the `<html>` class hydration note for `appearance: "system"` visitors (see Issues Encountered) is pre-existing from Plan 01-06 and was not introduced or modified by this plan. If a future phase wants zero hydration console noise, `suppressHydrationWarning` on `layout.tsx`'s `<html>` element (or resolving `'system'` server-side via a client hint, if one becomes available) would be the fix -- out of this plan's scope to make unilaterally.
- Per `config.json`'s `human_verify_mode: "end-of-phase"`, a dedicated human UAT pass (real device/browser, both light/dark and at least one RTL language) is still recommended before Phase 1 closes, covering the backstop items already flagged by 01-09/01-10 (70vh language-sheet scroll at 360x640, welcome-line fold clearance across scripts, appearance-toggle rapid-tap stability, bidi grapheme rendering, live SSE reconnect/D-15-silence) -- none of which are blocked on more code, all now observable in this plan's fully composed page.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 3 claimed files found on disk (`src/app/page.tsx`, `src/components/chat/ChatShell.tsx`, `src/components/chat/Composer.tsx`). The 1 claimed commit hash (`e8d2c5b`) found in `git log --oneline --all`.
