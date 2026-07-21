---
phase: 01-foundation-and-the-realtime-spine
plan: 11
subsystem: admin-ui
tags: [nextjs-app-router, admin-dashboard, sse, drizzle-lateral-join, rtl]

# Dependency graph
requires:
  - phase: 01-foundation-and-the-realtime-spine (01-07)
    provides: "requireOwner() guard, owner_session cookie contract, proxy.ts edge guard on /admin/*"
  - phase: 01-foundation-and-the-realtime-spine (01-08)
    provides: "GET /api/admin/stream (owner-scoped SSE firehose), POST /api/admin/messages (durable owner reply), repo.messages.since"
  - phase: 01-foundation-and-the-realtime-spine (01-10)
    provides: "src/components/chat/MessageBubble.tsx -- bidi-isolated, two-delivery-state message rendering, reused as-is"
provides:
  - "/admin -- flat, unsorted (beyond recency) conversation list with the locked empty-state copy"
  - "/admin/c/[id] -- thread view with SSR message history, live SSE-filtered updates, and a reply composer"
  - "repo.conversations.listWithPreview() -- LEFT JOIN LATERAL most-recent-message-per-conversation query"
affects: ["01-12 (final visitor-side page wiring is independent of this plan; no further admin work remains in this phase)", "01-13 (phase close/UAT will exercise this surface end to end)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "repo.conversations.listWithPreview() uses a raw db.execute(sql\`...\`) LEFT JOIN LATERAL rather than drizzle's query builder -- drizzle-orm 0.45.2's builder has no first-class 'most recent row per group' construct, and a lateral join is the correct, race-free way to express it in one round trip (no N+1 per-conversation lookup)."
    - "Thread.tsx follows the same admin-side EventSource-plus-client-filter pattern as chat/useChatStream.ts (Plan 01-10), but inlined directly in the component rather than extracted into a hook -- this plan's tasks had no tdd=\"true\" requirement, so there was no test-runnability pressure to split it out, unlike composer-logic.ts/useChatStream.ts."
  patterns_established: []

key-files:
  created:
    - src/components/admin/ConversationRow.tsx
    - src/app/admin/(auth)/page.tsx
    - src/app/admin/(auth)/c/[id]/page.tsx
    - src/components/admin/Thread.tsx
    - src/components/admin/ReplyBox.tsx
  modified:
    - src/server/repo/conversations.ts

key-decisions:
  - "Added repo.conversations.listWithPreview() (not in the plan's files_modified list) -- the plan's own Task 1 action text explicitly requires 'Query all conversations ordered by most-recent-message', and no existing repo function could do this; a LEFT JOIN LATERAL subquery (one most-recent message per conversation) plus a coalesce-to-conversation.createdAt fallback (a brand-new, message-less conversation must still render) was the only race-free single-query way to express it, verified against the live DB via an ad-hoc smoke script before commit (not a permanent test file, since no tdd requirement applies to this plan)."
  - "Cast Message['sender'] (drizzle infers plain string from schema.ts's untyped text('sender') column, guarded only by a Postgres CHECK constraint, not a typed enum) to the narrower 'visitor'|'owner' union at the two boundaries where repo rows flow into MessageBubble/ThreadMessage -- a narrow, explicit cast rather than loosening MessageBubble's own ChatMessageLike contract, since the DB-level CHECK constraint already guarantees the narrower set of values at runtime."
  - "SSE wiring and ReplyBox integration were built directly inside Thread.tsx as Task 3's own diff (Thread.tsx was created empty-of-SSE in Task 2, then edited in Task 3) rather than pre-wiring it in Task 2 -- keeps each task's commit scoped to exactly what its own <files>/<action> describes, even though the plan's Task 3 <files> tag lists only ReplyBox.tsx."
  - "ReplyBox.tsx implements its own lightweight silent-bounded-retry (3 attempts, 400ms delay) inline rather than importing/extending composer-logic.ts -- the plan's Task 3 action text explicitly calls this out ('a lighter version is fine -- this surface does not need D-19's full crisis-typing retry ceremony'), and composer-logic.ts's public functions are visitor-Composer-specific (optimistic-bubble creation, clientMsgId-keyed state) rather than a generic retry utility."

patterns-established:
  - "Admin-surface list/detail pages follow the visitor-chat precedent of an async Server Component (guard + SSR data fetch) rendering a 'use client' presentation component that owns its own EventSource/state -- same shape as Plan 01-06/01-09's visitor page composition, just under /admin instead of /."

requirements-completed: [ADMIN-03]

coverage:
  - id: D1
    description: "src/app/admin/(auth)/page.tsx contains no filter/status/faith-flag UI element and no ORDER BY clause referencing a priority/faith-decision column -- plain recency ordering only; renders the exact locked empty-state heading/body when zero conversations exist"
    requirement: "ADMIN-03"
    verification:
      - kind: other
        ref: "grep -iE \"faith|priority|status.*filter\" src/app/admin/(auth)/page.tsx -- zero matches; grep -c \"No conversations yet\" -- 1 match; both re-run against final committed HEAD"
        status: pass
      - kind: integration
        ref: "npm run build succeeds with /admin registered as a dynamic route"
        status: pass
    human_judgment: false
  - id: D2
    description: "ConversationRow.tsx truncates the last-message preview to one line via Tailwind's truncate utility combined with text-start (logical property), not a hardcoded text-align: left"
    requirement: "ADMIN-03"
    verification:
      - kind: other
        ref: "code read: className includes 'truncate text-start', no text-align/left literal anywhere in the file"
        status: pass
    human_judgment: true
    rationale: "Actual grapheme-level RTL rendering of a long last-message preview (UI-SPEC.md's long-text/admin-list-preview backstop row) is a visual property that requires a rendered browser, which this plan's tooling (plain node:test, no jsdom/Playwright) cannot exercise -- flagged for end-of-phase UAT."
  - id: D3
    description: "repo.conversations.listWithPreview() surfaces the single most recent message per conversation (verified against a real conversation with two messages inserted in sequence -- the second/most-recent one is the one returned), ordered by that message's createdAt (or the conversation's own createdAt for a message-less conversation) descending"
    requirement: "ADMIN-03"
    verification:
      - kind: integration
        ref: "ad-hoc smoke script (scripts/tmp-smoke-list.mjs, deleted after use -- not a committed artifact) inserted a real visitor/conversation/two-messages fixture against the local Postgres and asserted the returned preview row's body matched the second (most recent) message; PASS, then fixture rows deleted"
        status: pass
    human_judgment: false
  - id: D4
    description: "src/app/admin/(auth)/c/[id]/page.tsx runs requireOwner() and redirects to /admin/login before any conversationId parsing or DB access (T-01-32's mitigation); the thread's initial render includes the conversation's full message history via repo.messages.since -- the identical query the SSE backfill and polling fallback use -- without waiting for the SSE connection to open"
    requirement: "ADMIN-03"
    verification:
      - kind: other
        ref: "code read: requireOwner()+redirect precedes params/since() calls; grep -c \"MessageBubble\" src/components/admin/Thread.tsx >= 1"
        status: pass
      - kind: integration
        ref: "npm run build succeeds with /admin/c/[id] registered as a dynamic route; full npm run test -- 41/41 pass (no regressions)"
        status: pass
    human_judgment: true
    rationale: "No automated test exercises a live unauthenticated request against this page or renders the SSR HTML to confirm history appears before any client JS runs -- verified by code inspection (guard-then-fetch ordering) and the build/test suite, not a live HTTP/browser round trip."
  - id: D5
    description: "ReplyBox.tsx's POST targets /api/admin/messages (never /api/chat/messages); Thread.tsx's EventSource 'message' listener filters every incoming event by conversationId before appending, never rendering another conversation's messages into this thread; a failed reply POST does not clear ReplyBox's text field"
    requirement: "ADMIN-03"
    verification:
      - kind: other
        ref: "grep -c \"admin/messages\" src/components/admin/ReplyBox.tsx >= 1; code read: setText(\"\") only reachable on the confirmed-success branch, never on the retry-exhausted branch; code read: Thread.tsx's message listener returns early when row.conversationId !== conversationId"
        status: pass
    human_judgment: true
    rationale: "Live two-conversation firehose filtering and a live failed-send-preserves-text interaction both require a running server + real SSE connection + real network failure injection, none of which this plan's tooling exercises -- flagged for end-of-phase UAT, consistent with 01-08/01-10's own admin-stream and composer coverage notes."

# Metrics
duration: ~20min
completed: 2026-07-21
status: complete
---

# Phase 1 Plan 11: Owner Conversation List, Thread View, and Reply Composer Summary

**The remaining two of the three minimal owner screens (D-12) -- a flat, unfiltered conversation list and a thread view with a reply composer -- wired to Plan 01-08's owner-scoped SSE firehose and durable reply route, exercising the realtime spine end to end from the owner's side.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-21 (session start)
- **Completed:** 2026-07-21
- **Tasks:** 3 completed
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments

- `repo.conversations.listWithPreview()` -- a `LEFT JOIN LATERAL` query returning each conversation's single most-recent message (body, sender, time), falling back to the conversation's own `createdAt` when it has zero persisted messages yet (D-05: the client-side-only welcome is never a `messages` row), ordered by that timestamp descending -- a plain recency ordering with no priority/faith-decision weighting (D-12).
- `src/app/admin/(auth)/page.tsx` -- `requireOwner()`-guarded (redirects to `/admin/login`, defensive even though `proxy.ts` already guards the route at the edge), renders one `ConversationRow` per conversation or the exact locked "No conversations yet" / "When someone opens the chat and sends a message, it will appear here." empty state at the UI-SPEC.md 2xl (48px) vertical inset.
- `ConversationRow.tsx` -- last-message preview truncated to one line via Tailwind's `truncate` + `text-start` (logical property, correct under RTL), last-message time via the shared `formatDigits` ASCII-digit formatter, links to `/admin/c/[id]`. No status badge, no faith-decision flag, no filter chip anywhere.
- `src/app/admin/(auth)/c/[id]/page.tsx` -- `requireOwner()`-guarded, SSR-fetches the conversation's full history via `repo.messages.since(id, 0)` (the exact same query Plan 01-08's SSE backfill and polling fallback use) before any client JS runs.
- `Thread.tsx` -- renders history via Plan 01-10's `MessageBubble.tsx` (no bidi/delivery-state duplication -- T-01-33's XSS mitigation holds since no `dangerouslySetInnerHTML` is introduced here either), a `ChevronLeft` back-affordance to the list (the RTL-mirrored icon per UI-SPEC.md's allowlist), an `EventSource` against `/api/admin/stream` filtering every incoming event to the open `conversationId` (D-13's firehose, filtered client-side), and a mounted `ReplyBox`.
- `ReplyBox.tsx` -- posts to `/api/admin/messages` (never `/api/chat/messages`), a lighter silent-bounded-retry (3 attempts, 400ms delay, no D-19 crisis-typing ceremony) that never clears the owner's typed reply on a transient failure, clearing the field only on confirmed durable persistence.
- Full project `npm run build` (Turbopack + TypeScript) succeeds with `/admin` and `/admin/c/[id]` registered as dynamic route handlers; `npm run test` passes 41/41 (unchanged from Plan 01-10 -- no new automated tests in this plan, consistent with its tasks having no `tdd="true"` requirement).
- `listWithPreview()`'s lateral-join correctness (most-recent-message selection, not first/arbitrary) was verified against the real local Postgres via an ad-hoc smoke script (inserted a two-message fixture, asserted the second/most-recent message was the one returned, then deleted the fixture rows) -- the script itself was not committed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Flat conversation list** -- `296bef6` (feat)
2. **Task 2: Thread view** -- `9796b95` (feat)
3. **Task 3: Reply composer + admin SSE wiring** -- `aabf035` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/server/repo/conversations.ts` -- added `listWithPreview()` (`ConversationPreview` type, `LEFT JOIN LATERAL` query)
- `src/components/admin/ConversationRow.tsx` -- one flat-list row, logical-property truncation
- `src/app/admin/(auth)/page.tsx` -- guarded flat conversation list + empty state
- `src/app/admin/(auth)/c/[id]/page.tsx` -- guarded thread page, SSR message history
- `src/components/admin/Thread.tsx` -- history renderer (`MessageBubble` reuse) + admin SSE wiring + `ReplyBox` mount
- `src/components/admin/ReplyBox.tsx` -- owner reply composer, silent bounded retry

## Decisions Made

- Added `repo.conversations.listWithPreview()` beyond the plan's `files_modified` list (which named only `page.tsx`/`ConversationRow.tsx` for Task 1) because the task's own action text requires exactly this query and no existing repo function could produce it. A `LEFT JOIN LATERAL` subquery (one most-recent message per conversation, in a single round trip -- no N+1 per-row lookup) with a `coalesce`-to-`conversations.created_at` fallback was the correct race-free expression, verified against the live database before committing.
- Cast `Message["sender"]` (drizzle infers plain `string` from `schema.ts`'s untyped `text("sender")` column -- the narrower set is enforced only by a Postgres `CHECK` constraint, not a typed enum) to the `"visitor"|"owner"` union at the two boundaries where repo rows flow into `MessageBubble`/`ThreadMessage`, rather than loosening `MessageBubble`'s own `ChatMessageLike` contract -- the DB-level `CHECK` constraint already guarantees the narrower set of values at runtime, so this is a narrow, justified cast, not an unsafe one.
- Built the SSE-filter-by-`conversationId` logic and `ReplyBox` mount directly inside `Thread.tsx` as Task 3's own diff (Task 2 created `Thread.tsx` with only the SSR-rendered history and back-affordance) rather than pre-wiring it in Task 2 -- keeps each task's commit scoped to exactly its own stated action, even though Task 3's `<files>` tag names only `ReplyBox.tsx`.
- `ReplyBox.tsx` implements its own small inline retry loop (3 attempts, 400ms delay) rather than importing/extending Plan 01-10's `composer-logic.ts` -- the plan's own Task 3 text explicitly calls for "a lighter version," and `composer-logic.ts`'s exported functions are shaped around the visitor `Composer`'s optimistic-bubble/`clientMsgId` state machine, not a generic retry utility reusable as-is here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `repo.conversations.listWithPreview()`**
- **Found during:** Task 1
- **Issue:** Not in the plan's `files_modified` list, but Task 1's own action text ("Query all conversations ordered by most-recent-message") has no existing repo function to call -- the flat list literally cannot be built without it.
- **Fix:** Added a `LEFT JOIN LATERAL` query (`ConversationPreview` type) to `src/server/repo/conversations.ts`, mirroring the class of addition 01-08-SUMMARY.md documented for `sinceAll()`/`getPresence()` (a repo-layer gap the plan's own action text implies but doesn't separately list as a file).
- **Files modified:** `src/server/repo/conversations.ts`
- **Verification:** Ad-hoc smoke script against the live local Postgres confirmed correct most-recent-message selection (see coverage D3); `npm run build`/`npm run test` both pass.
- **Committed in:** `296bef6` (Task 1)

**2. [Rule 1 - Bug] TypeScript narrowing fix for `messages.sender`'s untyped column**
- **Found during:** Task 2 (first `npm run build` after wiring `since()`'s rows into `Thread`)
- **Issue:** `schema.ts`'s `messages.sender` is a plain `text()` column (guarded only by a Postgres `CHECK` constraint), so drizzle infers `Message["sender"]: string` rather than the narrower `"visitor"|"owner"` union `ThreadMessage`/`MessageBubble` require -- a straight assignment failed the build's type check.
- **Fix:** Mapped each row's `sender` through an explicit `as ThreadMessage["sender"]` cast at the two boundaries (SSR fetch in `page.tsx`, SSE payload parse in `Thread.tsx`) where repo/wire data becomes UI-typed data -- justified since the DB `CHECK` constraint already guarantees only those two values exist at runtime.
- **Files modified:** `src/app/admin/(auth)/c/[id]/page.tsx`, `src/components/admin/Thread.tsx`
- **Verification:** `npm run build` -- TypeScript pass succeeds.
- **Committed in:** `9796b95` (Task 2), `aabf035` (Task 3)

---

**Total deviations:** 2 auto-fixed (1 Rule 2 -- missing critical repo query; 1 Rule 1 -- type-narrowing bug fix).
**Impact on plan:** Both were necessary to make the plan's own stated action text achievable or to make the resulting code type-check. No feature scope, schema, or API surface changed beyond what the plan specified.

## Issues Encountered

None beyond the two documented deviations above. No race with a concurrent executor session was observed on this plan -- `git log --oneline -5` at session start showed `HEAD` exactly at `1dab975` ("docs(01-10): complete composer/message-list/eventsource plan"), matching the orchestrator's expected starting point, and `git status --porcelain` showed only an unrelated untracked `PRD-chat-site.md` at the repo root.

## Known Stubs

None. Every component renders real, wired behavior: the conversation list queries the real DB, the thread SSR-fetches real message history, `ReplyBox` posts to the real `/api/admin/messages` route, and `Thread`'s `EventSource` connects to the real `/api/admin/stream` firehose. No hardcoded empty arrays flow to UI, no placeholder/"coming soon" text exists anywhere in this plan's deliverables.

## Threat Flags

None. Both threats in this plan's `<threat_model>` were mitigated exactly as specified:
- **T-01-32** (Elevation of Privilege, `src/app/admin/(auth)/c/[id]/page.tsx`) -- `requireOwner()` runs and redirects before any `params`/`since()` access; no conversationId-based visitor-side bypass exists since owner scope is global by design (D-13).
- **T-01-33** (Tampering/XSS, `src/components/admin/Thread.tsx`) -- reuses `MessageBubble.tsx`'s plain-text JSX rendering; no `dangerouslySetInnerHTML` introduced anywhere in `src/components/admin/`.

## User Setup Required

None -- no external service configuration required. This plan only consumes routes/guards already configured by Plans 01-07/01-08.

## Next Phase Readiness

- ADMIN-03 is fully satisfied: the owner can open any existing conversation from the flat list, read its history (SSR-loaded, live-updated), and reply -- the reply persists via the identical durable transactional pattern (insert + `pg_notify` in one `db.transaction()`) the visitor's own send path uses, and appears live in the thread via the owner-scoped SSE firehose filtered client-side to the open conversation.
- The many-conversation scale ceiling (plain scroll, no virtualization) remains an explicit, accepted Phase 1 assumption per UI-SPEC.md's `zero-one-many` unresolved row -- deferred to Phase 3 re-evaluation, not addressed here.
- Backstop verification items (RTL grapheme-level truncation rendering, live two-conversation firehose filtering under a real second browser tab, a genuine network-failure-preserves-typed-text interaction) are flagged `human_judgment: true` in this SUMMARY's `coverage` block for end-of-phase UAT, consistent with `config.json`'s `human_verify_mode: "end-of-phase"` and the same pattern 01-08/01-10-SUMMARY.md already established for this project.
- No blockers. This was the last plan touching the admin surface in Phase 1 -- Plans 01-12/01-13 close out the visitor-side wiring and phase-level verification.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 6 claimed files found on disk; all 3 claimed commit hashes (`296bef6`, `9796b95`, `aabf035`) found in `git log --oneline --all`.
