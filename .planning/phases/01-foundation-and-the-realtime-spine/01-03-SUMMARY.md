---
phase: 01-foundation-and-the-realtime-spine
plan: 03
subsystem: database
tags: [postgres, listen-notify, postgres.js, drizzle-orm, pub-sub, rate-limiting, node-test]

# Dependency graph
requires:
  - phase: 01-01
    provides: 7-table Drizzle schema (visitors, conversations, messages, rateLimitBuckets, etc.), local Postgres via docker-compose
provides:
  - "src/server/db/pool.ts — shared bounded postgres.js query pool (max: 10) + Drizzle wrapper, used by every repo module"
  - "src/server/db/listener.ts — dedicated max:1 sql.listen() connection on chat/presence channels, startListener() boot function"
  - "src/instrumentation.ts — boots the listener exactly once at process start (nodejs runtime only)"
  - "src/server/realtime/hub.ts — in-process pub-sub: subscribe/subscribeAll/publishChat/publishPresence, zero DB connections"
  - "src/server/repo/{visitors,conversations,messages,ratelimit}.ts — the shared, tested data-access API every later Phase 1 route imports instead of writing raw queries inline"
  - "node --experimental-strip-types + node:test as the project's test-running convention (no jest/vitest dependency added)"
affects: [01-06, 01-07, 01-08, 01-09, 01-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated LISTEN connection (postgres.js sql.listen, max:1) kept structurally separate from the bounded query pool (max:10) — connection count is architecture, not configuration"
    - "In-process pub-sub hub with zero DB access — SSE routes (Plan 01-08) will hold only a hub subscription, never a DB connection for the stream's lifetime"
    - "Race-free Postgres token-bucket rate limiter: single INSERT ... ON CONFLICT ... WHERE statement, no SELECT-then-UPDATE round trip"
    - "Partial-unique-index-aware upsert: onConflictDoNothing({ target, where }) matching a partial index's own predicate, with a re-SELECT fallback for the race loser"
    - "node --experimental-strip-types --env-file=.env.local --test as the repo-layer test runner; internal relative imports in db/pool.ts and repo/*.ts use explicit .ts extensions (tsconfig: allowImportingTsExtensions) so those specific modules run standalone under plain Node, not just inside Next's bundler"

key-files:
  created:
    - src/server/db/pool.ts
    - src/server/db/listener.ts
    - src/instrumentation.ts
    - src/server/realtime/hub.ts
    - src/server/repo/visitors.ts
    - src/server/repo/conversations.ts
    - src/server/repo/messages.ts
    - src/server/repo/ratelimit.ts
    - src/server/repo/visitors.test.ts
    - src/server/repo/conversations.test.ts
    - src/server/repo/messages.test.ts
    - src/server/repo/ratelimit.test.ts
  modified:
    - tsconfig.json
    - package.json

key-decisions:
  - "hub.ts's Subscriber type is a single callback function (event: HubEvent) => void, not an object with separate onChat/onPresence methods — matches the plan's literal task wording ('subscribe(conversationId, callback)') and lets one SSE route handler branch on event.type."
  - "conversations.openFor() uses select-then-(insert with ON CONFLICT DO NOTHING targeting the partial unique index, matching its WHERE predicate)-then-re-select-on-race-loss, rather than a single statement, because Postgres partial-index conflict targets require an explicit matching predicate (Drizzle's onConflictDoNothing({ target, where }))."
  - "messages.create()'s client_msg_id dedup is select-then-insert, not a single atomic statement — the schema has no unique constraint on (conversation_id, client_msg_id) to arbitrate an ON CONFLICT clause, and adding one is a schema change outside this plan's file scope. Documented as a known limitation (see Deviations)."
  - "Added tsconfig.json's allowImportingTsExtensions and used explicit .ts import extensions only in the files whose test files needed to run standalone via plain node (db/pool.ts and repo/*.ts) — listener.ts, instrumentation.ts, and hub.ts keep the ordinary Next.js extensionless convention since they're never invoked outside Next's bundler."
  - "Test runner is Node's built-in node:test via --experimental-strip-types, not vitest/jest — zero new dependencies, consistent with the project's minimal-tooling stance. package.json script name is 'test'; use 'npm run test' rather than the bare 'npm test' shorthand in this dev environment specifically (see Issues Encountered)."

patterns-established:
  - "Repo layer never calls pg_notify — only route handlers (Plan 01-06+) do, in the same transaction as the write, per 01-RESEARCH.md's durability-first design."
  - "Every repo test file registers an after() hook that closes the shared postgres.js pool — node:test runs each file in its own child process, and an unclosed connection pool keeps that process (and the whole run) alive indefinitely."

requirements-completed: [FOUND-02, OPS-01]

coverage:
  - id: D1
    description: "Dedicated LISTEN connection (max:1) is structurally separate from the bounded query pool (max:10, not unbounded), and hub subscriptions add zero DB connections regardless of subscriber count — FOUND-02's fixed-connection-count property"
    requirement: "FOUND-02"
    verification:
      - kind: other
        ref: "grep assertions from the plan's Task 1/Task 2 <verify> blocks (no `pg` import, literal `max: 1` in listener.ts, literal bounded max in pool.ts, zero postgres/drizzle-orm imports in hub.ts) — all pass, re-run at SUMMARY time"
        status: pass
      - kind: other
        ref: "manual pg_stat_activity check: query pool holds 1 physical connection with 51 hub subscribers attached (0 added); a second, separate max:1 sql.listen() connection adds exactly 1 more — confirms the pool+listener topology is decoupled from subscriber count"
        status: pass
    human_judgment: false
  - id: D2
    description: "In-process pub-sub hub (subscribe, subscribeAll, publishChat, publishPresence) fans out to per-conversation and admin-firehose (D-13) subscribers with zero DB access"
    verification:
      - kind: other
        ref: "grep: no postgres/drizzle-orm import in hub.ts; 6 exported symbols (HubEvent, Subscriber, subscribe, subscribeAll, publishChat, publishPresence)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Repo layer (visitors.getOrCreate, conversations.openFor, messages.create/since, ratelimit.check) implements the four required behaviors: brand-new rate-limit key charged atomically, a full burst then rate-limited, messages.since ascending-order backfill, and conversations.openFor idempotency (including under real concurrency)"
    requirement: "OPS-01"
    verification:
      - kind: unit
        ref: "src/server/repo/{visitors,conversations,messages,ratelimit}.test.ts — 8/8 tests pass via `npm run test` against the local docker-compose Postgres"
        status: pass
      - kind: other
        ref: "manual refill-visibility check: capacity=3, refillRate=2/s bucket goes rate-limited after a 3-message burst, then allowed again after a 600ms wait — confirms token refill becomes visible after the configured interval (must-have truth, not covered by the committed unit tests)"
        status: pass
    human_judgment: false

# Metrics
duration: 30min
completed: 2026-07-20
status: complete
---

# Phase 1 Plan 03: Realtime Infrastructure and Data Repository Layer Summary

**Dedicated postgres.js `sql.listen()` connection (max:1) + bounded query pool (max:10), an in-process pub-sub hub, and a tested repo layer (visitors/conversations/messages/ratelimit) with a race-free Postgres token-bucket rate limiter — the shared substrate every later Phase 1 route imports.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-07-20T15:44:00+03:00
- **Completed:** 2026-07-20T15:54:00+03:00
- **Tasks:** 3 (Task 3 ran the full TDD RED → GREEN cycle)
- **Files modified:** 14 (8 created source files, 4 created test files, 2 modified config files)

## Accomplishments

- One dedicated `max:1` LISTEN connection (`src/server/db/listener.ts`) on the `chat` and `presence` channels, never importing `pg`, guarded against double-registration across dev's hot-reload cycles — boots exactly once from `src/instrumentation.ts`
- A separate bounded query pool (`src/server/db/pool.ts`, `max: 10`) wrapped in a Drizzle instance, used by every repo module
- A pure in-process pub-sub hub (`src/server/realtime/hub.ts`) with per-conversation and admin-firehose (D-13) subscription scopes and zero DB access — verified empirically that 51 hub subscribers add zero additional Postgres connections
- A tested data repository layer: `visitors.getOrCreate`, `conversations.openFor` (partial-unique-index-safe under real concurrency, verified with `Promise.all`), `messages.create`/`since` (DB is the sole ordering source via `bigserial` id), and `ratelimit.check` (Pattern 7's single-statement token bucket, verified for atomicity, burst behavior, and refill visibility)
- 8/8 unit tests pass via Node's built-in test runner (`node --experimental-strip-types --test`) against the local docker-compose Postgres — no new test-framework dependency added

## Task Commits

1. **Task 1: Dedicated LISTEN connection, query pool, instrumentation boot** - `904f845` (feat)
2. **Task 2: In-process pub-sub hub** - `bef8794` (feat)
3. **Task 3: Data repository layer** - `bacfb51` (test, RED) → `83cd487` (feat, GREEN)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/server/db/pool.ts` - Shared bounded postgres.js pool (max: 10) + Drizzle wrapper
- `src/server/db/listener.ts` - Dedicated max:1 `sql.listen()` connection, `startListener()`
- `src/instrumentation.ts` - Boots the listener once at process start
- `src/server/realtime/hub.ts` - In-process pub-sub, per-conversation + admin-firehose scopes
- `src/server/repo/visitors.ts` - `getOrCreate(visitorId?, lang?, appearance?)`
- `src/server/repo/conversations.ts` - `openFor(visitorId)`, race-free under concurrency
- `src/server/repo/messages.ts` - `create(...)` (client_msg_id idempotent), `since(...)`
- `src/server/repo/ratelimit.ts` - `check(key, capacity, refillRate)`, Pattern 7 token bucket
- `src/server/repo/{visitors,conversations,messages,ratelimit}.test.ts` - 8 behavior tests
- `tsconfig.json` - Added `allowImportingTsExtensions` (needed by pool.ts/repo's `.ts`-suffixed imports)
- `package.json` - Added `"test"` script (Node's built-in test runner, no new dependency)

## Decisions Made

- `hub.ts`'s `Subscriber` type is a single callback `(event: HubEvent) => void`, not a two-method object — matches the plan's literal wording and lets one handler branch on `event.type`.
- `conversations.openFor()` and the rate limiter both had to be adapted from the plan's narrative description into exact Drizzle/SQL calls (select-then-`onConflictDoNothing({ target, where })`-then-re-select for the partial index; Pattern 7's literal SQL for the rate limiter) — verified against `node_modules/drizzle-orm`'s own `.d.ts` and Context7 docs rather than assumed.
- Test running required explicit `.ts` extensions on relative imports inside `db/pool.ts` and `repo/*.ts` (plus `tsconfig.json`'s `allowImportingTsExtensions`), because Node's native module resolution — even under `--experimental-strip-types` — does not resolve extensionless relative imports the way Next's bundler does. Scoped the change to only the files actually reached by the test entry point; `listener.ts`, `instrumentation.ts`, and `hub.ts` keep the ordinary extensionless Next.js convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Repo-layer tests couldn't run standalone under plain Node**
- **Found during:** Task 3 (writing the RED tests)
- **Issue:** `db/pool.ts` and `repo/*.ts` use ordinary Next.js-style extensionless relative imports (`from "./schema"`). Node's ESM resolver — even with `--experimental-strip-types` — throws `ERR_MODULE_NOT_FOUND` on those when run outside Next's bundler, which is exactly how the plan's own `<verify>` block runs them (`node --test src/server/repo/*.test.*`).
- **Fix:** Added explicit `.ts` extensions to the relative imports in `db/pool.ts` and `repo/*.ts` only, and added `allowImportingTsExtensions: true` to `tsconfig.json` (paired with the pre-existing `noEmit: true`) so `tsc`/Next's own type-checking accepts the explicit extensions. Verified `npm run build` still succeeds (Next's Turbopack/TypeScript pass compiles the extensioned imports without issue).
- **Files modified:** `src/server/db/pool.ts`, `src/server/repo/visitors.ts`, `src/server/repo/conversations.ts`, `src/server/repo/messages.ts`, `tsconfig.json`
- **Verification:** `npm run build` succeeds; `npm run test` runs and passes 8/8.
- **Committed in:** `904f845` (tsconfig.json, part of Task 1), `83cd487` (repo files, part of Task 3 GREEN)

**2. [Rule 3 - Blocking] `node --test` never exited (hung on open DB connections)**
- **Found during:** Task 3 (first GREEN test run)
- **Issue:** `node:test` runs each test file in its own child process. The shared `postgres.js` pool's sockets stayed open after tests finished, so the child process (and the whole `node --test` run) never exited — the first attempted run hit a 120s tool timeout with only one of four test files' output flushed.
- **Fix:** Added an `after(async () => { await sql.end({ timeout: 5 }); })` hook to each `*.test.ts` file, closing the pool once that file's tests complete.
- **Files modified:** `src/server/repo/visitors.test.ts`, `src/server/repo/conversations.test.ts`, `src/server/repo/messages.test.ts`, `src/server/repo/ratelimit.test.ts`
- **Verification:** Full `npm run test` run now completes and exits in well under a second of wall-clock test time (~680ms), 8/8 pass.
- **Committed in:** `83cd487` (part of Task 3 GREEN — these test files were touched again after their RED commit specifically for this fix)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues preventing the TDD task's own `<verify>` step from completing, not architectural or scope changes)
**Impact on plan:** Both fixes are narrowly scoped to making the plan's own required TDD verification actually runnable in this environment. No feature scope, schema, or API surface changed.

## Issues Encountered

- **This dev environment's `npm` binary is a Bun shim.** `npm test` (the bare shorthand) gets intercepted by Bun's own special-cased `bun test` runner instead of executing the `"test"` script defined in `package.json` — it silently ran Bun's test framework (which found and failed on our `node:test`-style files) instead of our Node script. `npm run test` (explicit `run`) is unaffected and works correctly. Documented in the test files' own header comment and here for whoever runs this next; not something the plan or this repo's code needed to change, purely a locally-observed environment quirk.
- **Standalone `npx tsc --noEmit` fails** with `TS5101` (`baseUrl` deprecated) — this is a pre-existing `tsconfig.json` setting from Plan 01-01 (`c50ff66`), unrelated to this plan's changes, and Next's own build-time TypeScript pass (`npm run build`) does not hit the same failure. Left as-is; out of this plan's scope per the scope-boundary rule. Logging here rather than silently fixing it, since a future plan may want to address it deliberately (e.g. `"ignoreDeprecations": "6.0"` or dropping `baseUrl` in favor of `paths`-only resolution).

## Next Phase Readiness

- The realtime spine (dedicated listener + bounded pool + hub) and the full repo API (`visitors`, `conversations`, `messages`, `ratelimit`) are ready for Plan 01-06 (write path), 01-07 (identity/cookie), and 01-08 (SSE routes) to import directly instead of writing raw queries inline.
- No blockers. `messages.create()`'s `client_msg_id` idempotency race window (documented above) is worth a look if a future hardening pass wants full concurrent-retry safety — would need a schema migration adding a unique constraint on `(conversation_id, client_msg_id)`, which is out of this plan's scope.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 12 claimed files found on disk; all 4 claimed commit hashes (`904f845`, `bef8794`, `bacfb51`, `83cd487`) found in `git log --oneline --all`.
