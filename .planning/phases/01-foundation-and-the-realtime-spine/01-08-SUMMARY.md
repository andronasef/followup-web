---
phase: 01-foundation-and-the-realtime-spine
plan: 08
subsystem: realtime
tags: [sse, eventsource, last-event-id, postgres-transaction, pg_notify, rate-limiting, zod, node-test]

# Dependency graph
requires:
  - phase: 01-foundation-and-the-realtime-spine (01-03)
    provides: "server/realtime/hub.ts (subscribe/subscribeAll/publishChat/publishPresence), repo.messages.{create,since}, repo.ratelimit.check"
  - phase: 01-foundation-and-the-realtime-spine (01-06)
    provides: "requireVisitor() -- visitor identity + open conversation resolution"
  - phase: 01-foundation-and-the-realtime-spine (01-07)
    provides: "requireOwner() -- owner session guard"
provides:
  - "GET /api/chat/stream -- visitor-scoped SSE, force-dynamic, subscribe-before-backfill, Last-Event-ID replay, D-15 ~4-minute recycle, initial presence event"
  - "GET /api/admin/stream -- owner-scoped SSE firehose (hub.subscribeAll + repo.messages.sinceAll), same shape as the visitor stream"
  - "GET /api/messages?since= -- D-16 polling fallback, shares the exact repo.messages.since query, client switch stays off this phase"
  - "POST /api/chat/messages -- durable, rate-limited visitor send (send.ts's sendVisitorMessage, next/headers-free and directly node:test-able)"
  - "POST /api/admin/messages -- durable owner reply, same transactional pattern (reply.ts's handleAdminReply)"
  - "repo/messages.ts: sinceAll() and an optional DbExecutor param on create() so a caller's own db.transaction() can wrap the insert"
  - "repo/responders.ts: getPresence() -- the D-06/D-07 presence read path"
affects: ["01-09 (usePresence consumes the 'presence' SSE event's isOwnerOnline field)", "01-10 (useChatStream consumes 'message' events, Composer posts to /api/chat/messages)", "01-11 (admin dashboard's ReplyBox posts to /api/admin/messages, thread view consumes /api/admin/stream filtered by conversationId)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SSE routes hold only a hub subscription plus short-lived repo queries -- never a DB connection for the stream's lifetime. subscribe() is registered (both hub.subscribe and hub.subscribeAll) textually and temporally before the first backfill query, and a DB-backed 'pump' re-queries repo.messages.since/sinceAll from the last emitted id on every live event so live and backfilled messages can never duplicate or gap regardless of exact interleaving -- the DB, not a buffered event array, is the ordering source of truth."
    - "Route handlers that need to be exercised by node:test are split into a next/headers-free module (send.ts, reply.ts) holding the actual behavior, plus a thin route.ts that only does requireVisitor()/requireOwner() + Response.json(). Plain Node's ESM resolver cannot resolve the bare 'next/headers' specifier outside Next's own bundler -- importing route.ts directly from a test drags that in transitively and crashes the whole test file at load time."
    - "Insert + pg_notify happen inside one db.transaction(), with repo.messages.create() accepting an optional DbExecutor (structurally Pick<typeof db, 'select'|'insert'>) so the same repo function runs either against the shared pool or inside the caller's transaction -- CHAT-06's 'durable before the 200' property."

key-files:
  created:
    - src/app/api/chat/stream/route.ts
    - src/app/api/admin/stream/route.ts
    - src/app/api/messages/route.ts
    - src/app/api/chat/messages/route.ts
    - src/app/api/chat/messages/send.ts
    - src/app/api/chat/messages/send.test.ts
    - src/app/api/admin/messages/route.ts
    - src/app/api/admin/messages/reply.ts
    - src/app/api/admin/messages/reply.test.ts
  modified:
    - src/server/repo/messages.ts
    - src/server/repo/responders.ts
    - package.json
    - .env.example

key-decisions:
  - "send.ts / reply.ts hold the write routes' actual behavior with zero next/headers dependency; route.ts stays a thin wrapper. Not in the plan's files_modified list, added per the same class of constraint 01-03-SUMMARY.md already documented (extensionless imports breaking plain-node test execution) -- here it's a transitive next/headers import instead."
  - "repo.messages.create() gained an optional DbExecutor parameter (default: the shared db) rather than duplicating insert logic inline in each write route -- lets the literal plan text ('insert the message row via repo.messages.create(...) ... in the same transaction') be followed exactly while keeping the insert+notify atomic."
  - "admin/stream uses a DB-backed 'pump' against a new repo.messages.sinceAll(sinceId) (not scoped to one conversation) rather than resolving each hub event by id via a per-message lookup -- mirrors chat/stream's race-free design exactly and gives the admin firehose its own Last-Event-ID backfill, matching 01-11-PLAN.md's expectation that the thread view 'appends new messages to the rendered list live' without an extra fetch."
  - "IP_HASH_SECRET falls back to SESSION_SECRET when unset (both env vars are documented in .env.example) rather than being a hard-required second secret -- keeps the route working out of the box while still supporting an independently-rotatable dedicated secret in production."
  - "Rate-limit and message-length constants (RATE_LIMIT_CAPACITY=20, RATE_LIMIT_REFILL_RATE=0.5 tokens/sec per 01-RESEARCH.md's concrete OPS-01 recommendation; MAX_MESSAGE_CODEPOINTS=4000, Unicode-code-point-aware not UTF-16-code-unit) are planner-discretion values -- no locked number exists in UI-SPEC.md/REQUIREMENTS.md for either."

patterns-established:
  - "Any future route needing both next/headers-guarded auth AND direct node:test coverage follows the send.ts/reply.ts split: <name>.ts (behavior, testable) + route.ts (thin Next glue)."

requirements-completed: [CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07, OPS-01, ADMIN-03]

coverage:
  - id: D1
    description: "Both SSE routes (chat/stream, admin/stream) are force-dynamic, subscribe to the hub before running their backfill query, emit every message event with id: <messages.id>, and release the hub subscription on req.signal's abort event"
    requirement: "CHAT-07"
    verification:
      - kind: other
        ref: "grep: force-dynamic present in both routes; hub.subscribe/subscribeAll line precedes since/sinceAll line in both files; signal referenced in both — all confirmed via literal grep re-run against final committed HEAD"
        status: pass
      - kind: integration
        ref: "npm run build succeeds (Turbopack + TypeScript pass) with both routes registered as dynamic (ƒ) route handlers"
        status: pass
    human_judgment: false
  - id: D2
    description: "The visitor write path (POST /api/chat/messages) persists a valid body and returns id+createdAt, rejects empty/whitespace bodies with 400 and zero rows, is idempotent on clientMsgId, and rate-limits a burst-plus-one with a 429 carrying no lockout/countdown copy — all inside one db.transaction() wrapping insert+pg_notify"
    requirement: "CHAT-03"
    verification:
      - kind: unit
        ref: "src/app/api/chat/messages/send.test.ts -- 5/5 behavior tests pass via `npm run test`"
        status: pass
    human_judgment: false
  - id: D3
    description: "POST /api/admin/messages rejects an unauthenticated caller with 401 and persists nothing; an authenticated owner's reply persists an owner-sender row via the identical durability pattern"
    requirement: "ADMIN-03"
    verification:
      - kind: unit
        ref: "src/app/api/admin/messages/reply.test.ts -- 2/2 tests pass via `npm run test`"
        status: pass
    human_judgment: false
  - id: D4
    description: "Neither write route imports openai or references translation/OVH anywhere -- zero calls to any language-conversion provider in the Phase 1 write path"
    requirement: "CHAT-06"
    verification:
      - kind: other
        ref: "grep -RiE \"openai|translat\" across route.ts/send.ts/reply.ts -- zero matches"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /api/messages?since= is authenticated (401 with neither a visitor cookie nor an owner session) and reuses the exact repo.messages.since query the SSE backfill uses, not a reimplementation"
    requirement: "CHAT-07"
    verification:
      - kind: other
        ref: "grep -c \"repo.messages.since\" src/app/api/messages/route.ts >= 1; code read confirms the imported `since` binding is the same export chat/stream/route.ts imports"
        status: pass
    human_judgment: true
    rationale: "No automated integration test exercises a live 401-vs-200 request against this route in this plan; verified by code inspection (both auth branches gate before any DB call) and the full project build/type-check, not a live HTTP round trip."
  - id: D6
    description: "A message sent while the owner is online and one sent while offline persist identically -- presence never gates a send; the chat/stream route's initial presence event never claims the owner is present when they are not (reads responders.is_online fresh on every connect)"
    requirement: "CHAT-05"
    verification: []
    human_judgment: true
    rationale: "Presence gating (or its absence) is a structural property of send.ts (no presence read anywhere in the write path) confirmed by code inspection, not exercised by a live two-tab owner-online/offline scenario in this plan -- Plan 01-09's usePresence/PresenceLine components are what actually render this to a human for the first time."

# Metrics
duration: ~15min
completed: 2026-07-20
status: complete
---

# Phase 1 Plan 08: Realtime Read Path (SSE) and Durable Write Path Summary

**Visitor + admin SSE routes with race-free subscribe-before-backfill and Last-Event-ID replay, plus transactional (insert+pg_notify) rate-limited write routes for visitor sends and owner replies — the "message durable before it is anything else" property the whole phase exists to prove.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-20T17:27:03+03:00 (first task commit)
- **Completed:** 2026-07-20T17:28:52+03:00 (final task commit)
- **Tasks:** 3 completed
- **Files modified:** 13 (9 created, 4 modified)

## Accomplishments

- `GET /api/chat/stream` — visitor-scoped SSE (force-dynamic, nodejs runtime), subscribes to the hub before running `repo.messages.since` backfill, a DB-backed "pump" that re-queries from the last emitted id on every live event so backfilled and live messages can never duplicate or gap, an initial `presence` event (`{ isOwnerOnline }`) read fresh from `repo.responders.getPresence()`, a heartbeat every 20s, and a deliberate ~4-minute D-15 recycle that closes the stream normally (not as an error) so `EventSource`'s native reconnect + `Last-Event-ID` exercises the replay path routinely
- `GET /api/admin/stream` — the same shape via `hub.subscribeAll()` and a new `repo.messages.sinceAll()`, giving the owner-scoped firehose (D-13) its own race-free backfill so a reconnecting admin dashboard never loses a message either
- `GET /api/messages?since=` — the D-16 polling fallback, authenticated as either a visitor (own conversation) or an owner (`conversationId` query param), calling the exact same `repo.messages.since` query the SSE backfill uses
- `POST /api/chat/messages` — `send.ts`'s `sendVisitorMessage()` checks both the visitor-id and HMAC'd-IP rate-limit buckets (capacity 20, refill 0.5 tokens/sec, no lockout/countdown copy in the 429 body), validates the body with a Unicode-code-point-aware zod schema (trimmed, non-empty, ≤4000 code points), then inserts + `pg_notify`'s inside one `db.transaction()` so a 200 is only ever returned after a durable commit; `pg_notify`'s payload is `{c, m, k}` pointers only, never the message body
- `POST /api/admin/messages` — `reply.ts`'s `handleAdminReply()` is the identical durability pattern, gated by an already-resolved `ownerId` (401 before any DB access if absent)
- `repo/messages.ts` gained `sinceAll()` and an optional `DbExecutor` parameter on `create()`; `repo/responders.ts` gained `getPresence()`
- `send.ts`/`reply.ts` are deliberately free of any `next/headers` import (direct or transitive) so `node:test` can exercise them without Next's bundler — `route.ts` stays a thin `requireVisitor()`/`requireOwner()` + `Response.json()` wrapper
- All 5 of Task 3's specified behavior tests pass, plus one additional negative-import test (`send.test.ts`); `reply.test.ts` covers the unauthenticated-401 and authenticated-persist cases
- Full project `npm run build` (Turbopack + TypeScript) succeeds with all five new routes registered as dynamic (`ƒ`) route handlers; `npm run test` passes 33/33 (26 pre-existing + 7 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: SSE routes — visitor stream and admin stream** — `97fc93e` (feat)
2. **Task 2: GET /api/messages?since= — shared polling fallback query** — `8ed2371` (feat)
3. **Task 3: POST /api/chat/messages and POST /api/admin/messages — durable, rate-limited writes** — `64a766a` (test, RED) → `6a00e4b` (feat, GREEN)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/app/api/chat/stream/route.ts` — visitor SSE, subscribe-before-backfill, presence, D-15 recycle
- `src/app/api/admin/stream/route.ts` — owner-scoped SSE firehose
- `src/app/api/messages/route.ts` — `GET ?since=` polling fallback (client switch off, D-16)
- `src/app/api/chat/messages/route.ts` — thin `POST` wrapper (visitor send)
- `src/app/api/chat/messages/send.ts` — `sendVisitorMessage()`, the actual durable/rate-limited behavior
- `src/app/api/chat/messages/send.test.ts` — 5 behavior tests + 1 negative-import test
- `src/app/api/admin/messages/route.ts` — thin `POST` wrapper (owner reply)
- `src/app/api/admin/messages/reply.ts` — `handleAdminReply()`, the actual durable behavior
- `src/app/api/admin/messages/reply.test.ts` — 2 behavior tests
- `src/server/repo/messages.ts` — added `sinceAll()`, `DbExecutor` param on `create()`
- `src/server/repo/responders.ts` — added `getPresence()`
- `package.json` — added the new route test files to the `test` script's glob
- `.env.example` — documented `IP_HASH_SECRET` (falls back to `SESSION_SECRET` if unset)

## Decisions Made

- `send.ts`/`reply.ts` hold the write routes' actual behavior in modules with zero `next/headers` dependency (directly or transitively); `route.ts` stays a thin wrapper calling `requireVisitor()`/`requireOwner()` then delegating. This is the same class of test-runnability constraint 01-03-SUMMARY.md documented for extensionless imports — here it's a bare `next/headers` specifier that plain Node's ESM resolver cannot resolve outside Next's bundler (`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../node_modules/next/headers'`), which crashes the whole test file at load time if `route.ts` is imported directly.
- `repo.messages.create()` gained an optional `DbExecutor` parameter (a structural `Pick<typeof db, "select"|"insert">`, satisfied by both the shared `db` and a `db.transaction()` callback's `tx`) so the plan's literal instruction — "insert the message row via `repo.messages.create(...)` ... in the same transaction" — could be followed exactly, keeping insert+notify atomic without duplicating insert logic in each route.
- `admin/stream` mirrors `chat/stream`'s exact race-free DB-backed pump design (rather than resolving each hub event by id via a one-off lookup), against a new `repo.messages.sinceAll(sinceId)` with no conversation scope. This gives the admin firehose its own Last-Event-ID backfill and matches 01-11-PLAN.md's stated expectation that the thread view "appends new messages to the rendered list live" without an extra client-side fetch.
- `IP_HASH_SECRET` falls back to `SESSION_SECRET` (already required, ≥32 bytes) when unset, documented in `.env.example` as the recommended-but-optional dedicated secret — the route works without a second mandatory env var, and a deployment can still rotate the IP hash independently of the session signing key by setting it.
- `RATE_LIMIT_CAPACITY=20`/`RATE_LIMIT_REFILL_RATE=0.5` tokens/sec and `MAX_MESSAGE_CODEPOINTS=4000` are planner-discretion values (01-RESEARCH.md's concrete OPS-01 recommendation for the former; no locked number exists anywhere for the latter) — both are simple exported constants a future plan can retune without touching the write logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `send.ts`/`reply.ts` split to make Task 3's TDD tests runnable under plain `node:test`**
- **Found during:** Task 3 (writing the RED tests)
- **Issue:** `chat/messages/route.ts` and `admin/messages/route.ts` import `requireVisitor()`/`requireOwner()`, which import `next/headers` at module scope. Node's ESM resolver — even with `--experimental-strip-types` — cannot resolve the bare `next/headers` specifier outside Next's own bundler, so importing `route.ts` directly from a test file crashes the entire test file at load time (`ERR_MODULE_NOT_FOUND`), not just individual assertions.
- **Fix:** Extracted the actual behavior into `send.ts`/`reply.ts` (zero `next/headers` dependency, directly importable by `node:test`); `route.ts` became a thin wrapper. Added both new files' test globs to `package.json`'s `test` script.
- **Files modified:** `src/app/api/chat/messages/route.ts`, `src/app/api/chat/messages/send.ts` (new), `src/app/api/admin/messages/route.ts`, `src/app/api/admin/messages/reply.ts` (new), `package.json`
- **Verification:** `npm run test` — 33/33 pass, including all 7 new tests; `npm run build` succeeds.
- **Committed in:** `6a00e4b` (Task 3 GREEN)

**2. [Rule 2 - Missing Critical] Added `repo/messages.ts`'s `sinceAll()` and `repo/responders.ts`'s `getPresence()`**
- **Found during:** Task 1
- **Issue:** Not in the plan's `files_modified` list, but the task's own action text requires an admin-firehose backfill query and a presence read ("push one initial presence event reading `responders.is_online`") that had no existing repo-layer function to call.
- **Fix:** Added `sinceAll(sinceId)` (global, unscoped `since`, used by `admin/stream/route.ts`'s pump) and `responders.getPresence()`.
- **Files modified:** `src/server/repo/messages.ts`, `src/server/repo/responders.ts`
- **Verification:** `npm run build`/`npm run test` both pass; grep-confirmed both SSE routes call these exports.
- **Committed in:** `97fc93e` (Task 1)

**3. [Rule 3 - Blocking] TypeScript narrowing fix in `chat/stream/route.ts`**
- **Found during:** Task 1 (first `npm run build`)
- **Issue:** `if (!conversation) return ...` narrows `conversation` to non-null in the enclosing scope, but TypeScript does not carry that narrowing into a nested `async function pump()` declaration, producing `'conversation' is possibly 'null'` on `since(conversation.id, ...)`.
- **Fix:** Captured `const conversationId = conversation.id;` immediately after the null check and used the plain `number` everywhere inside `pump()`/`hub.subscribe()` instead of `conversation.id`.
- **Files modified:** `src/app/api/chat/stream/route.ts`
- **Verification:** `npm run build` — TypeScript pass succeeds.
- **Committed in:** `97fc93e` (Task 1)

### Procedural / Operational Notes (not plan deviations)

**Concurrent execution on the same working tree.** Partway through Task 3, `git log` revealed that a second, concurrent executor session (the orchestrator's own documented race risk for this run — see this agent's system prompt) had already committed `64a766a` (test, RED) and `6a00e4b` (feat, GREEN) for the exact same task, independently arriving at a design identical to this session's own in-progress `send.ts`/`reply.ts` split (same file names, same next/headers-free rationale, same rate-limit/zod shape). After discovering this via `git log -- package.json` showing an unexpected prior commit, this session ran `git diff HEAD` against its own staged changes and confirmed byte-for-byte equivalence with the already-committed version. Rather than force a duplicate or conflicting commit, this session ran `git reset` to unstage its redundant changes (no files were altered or lost — the working tree already matched `HEAD` exactly) and adopted the concurrently-committed history as canonical. Final `npm run build`/`npm run test` were re-run against that exact `HEAD` and both pass. No functional difference resulted; this note exists purely for traceability of why Task 3 has no separate commit from this session despite this session having written and verified the identical code.

**TDD sequencing note.** Because of the above, Task 3's actual committed history (`64a766a` → `6a00e4b`) does follow the canonical RED→GREEN pattern, satisfying `<tdd_execution>`'s per-task convention even though this session's own independent drafting of the same code did not observe a live failing-test state (the concurrently-committed RED commit is the one of record).

---

**Total deviations:** 3 auto-fixed (2 Rule 3 — blocking test-runnability/type-narrowing issues; 1 Rule 2 — missing critical repo-layer functions) plus 1 operational note (concurrent-session reconciliation, no functional impact).
**Impact on plan:** All auto-fixes were necessary to make the plan's own stated must-haves/acceptance criteria achievable or to make its own required TDD verification actually runnable in this environment. No feature scope, schema, or API surface changed beyond what the plan specified.

## Issues Encountered

- **Concurrent executor race on this working tree** (see Procedural Notes above) — the orchestrator's own prompt for this run warned this could happen ("other concurrent executor sessions have been observed racing ahead on this repo during this orchestration run"), and it did, on this exact plan. Resolved by reconciliation, not duplication; documented above and in `git log` itself (author `Andrew Nasef` on both this session's earlier commits and the concurrently-landed ones, since both sessions share the same git identity).
- No other issues.

## User Setup Required

**One optional manual step, already documented in `.env.example`:** set `IP_HASH_SECRET` (generated the same way as `SESSION_SECRET`, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) as a runtime-only env var before production deploy, so the OPS-01 IP-hash bucket key rotates independently of the session-signing secret. Not required for local dev or for this plan's own tests — `src/app/api/chat/messages/send.ts` falls back to `SESSION_SECRET` (already required) if `IP_HASH_SECRET` is unset.

## Next Phase Readiness

- Plan 01-09's `usePresence` hook has a real `presence` SSE event (`{ isOwnerOnline: boolean }`) to consume from `chat/stream`.
- Plan 01-10's `useChatStream`/`Composer` have a real `message` SSE event (full row, `id`/`conversationId`/`sender`/`body`/`clientMsgId`/`createdAt`) and a real `POST /api/chat/messages` (`{ body, clientMsgId }` → `{ id, createdAt }` or a `429`/`400` reason code) to wire against, with `POLLING_FALLBACK_ENABLED` free to flip to `true` later since `GET /api/messages?since=` is already fully functional.
- Plan 01-11's admin dashboard thread view has `POST /api/admin/messages` (`{ conversationId, body, clientMsgId }`) and `GET /api/admin/stream` (owner-scoped firehose, full message rows, filter client-side by `conversationId`) ready to wire against.
- No blockers.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 13 claimed files found on disk; all 4 claimed commit hashes (`97fc93e`, `8ed2371`, `64a766a`, `6a00e4b`) found in `git log --oneline --all`.
