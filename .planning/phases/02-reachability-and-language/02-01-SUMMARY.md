---
phase: 02-reachability-and-language
plan: 01
subsystem: database
tags: [drizzle, postgres, web-push, vapid, schema, migration]

# Dependency graph
requires:
  - phase: 01-foundation-and-the-realtime-spine
    provides: schema.ts (visitors/conversations/messages/pushSubscriptions/messageTranslations/rateLimitBuckets tables), db/pool.ts (shared drizzle client), repo-layer conventions (DbExecutor pattern, node:test + node --experimental-strip-types), session.ts fail-loud-on-missing-secret pattern
provides:
  - pushGateFunnel table (visitor_id PK, platform check, set-once shown/prompt-reached/granted timestamps)
  - Unique index message_translations_message_lang_idx on (message_id, target_lang)
  - messages.delivered_at column (nullable ACK marker)
  - web-push@3.6.7 + @types/web-push@3.6.4 installed, exact-pinned
  - src/server/push/vapid.ts — fail-loud VAPID config seam + configured webpush export
  - src/server/repo/pushSubscriptions.ts — create/deleteByEndpoint/listForVisitor/markSuccess/markFailure
  - src/server/repo/gateFunnel.ts — recordShown/recordPromptReached/recordGranted/statsByPlatform
  - src/server/repo/messages.ts additions — markDelivered/belongsToConversation
  - src/server/config/models.ts — OWNER_LANG
  - src/server/repo/conversations.ts — getVisitorLangFor
  - Loopback-only docker-compose.yml db port publish (local dev connectivity restored)
affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08]

# Tech tracking
tech-stack:
  added: ["web-push@3.6.7", "@types/web-push@3.6.4"]
  patterns:
    - "COALESCE-based single-statement upsert for set-once funnel timestamps (mirrors ratelimit.ts's LEAST-based refill upsert)"
    - "isNull-guarded UPDATE for idempotent ACK marking (messages.markDelivered)"
    - "Endpoint-keyed onConflictDoUpdate upsert for push subscriptions (browsers silently rotate endpoints)"
    - "Fail-loud module-scope env validation for operationally-critical secrets (vapid.ts mirrors session.ts)"

key-files:
  created:
    - src/server/push/vapid.ts
    - src/server/repo/pushSubscriptions.ts
    - src/server/repo/pushSubscriptions.test.ts
    - src/server/repo/gateFunnel.ts
    - src/server/repo/gateFunnel.test.ts
    - drizzle/0001_uneven_union_jack.sql
  modified:
    - src/server/db/schema.ts
    - src/server/repo/messages.ts
    - src/server/repo/messages.test.ts
    - src/server/repo/conversations.ts
    - src/server/repo/conversations.test.ts
    - src/server/config/models.ts
    - package.json
    - .env.example
    - docker-compose.yml

key-decisions:
  - "docker-compose.yml's db service restored to a loopback-only host port publish (127.0.0.1:5433:5432) -- Plan 01-13 removed it entirely to avoid exposing Postgres on a production host's public IP, but that also broke the local dev workflow (npm run migrate, npm test) this plan's own tasks depend on. Loopback-only preserves the production security intent while restoring local connectivity."
  - "gateFunnel.ts/pushSubscriptions.ts use single-statement upserts (ON CONFLICT ... COALESCE / onConflictDoUpdate), never SELECT-then-UPDATE -- matches ratelimit.ts's established race-free pattern."
  - "getVisitorLangFor returns null (not a hardcoded 'en' default) when the visitor's lang column is null -- the caller (Plan 02-05) is responsible for the 'en' fallback, documented in the function's doc comment."
  - "statsByPlatform() does not synthesize a literal-0 row for a platform absent from push_gate_funnel (no independent platform catalog to LEFT JOIN against) -- documented in a code comment that Plan 02-08's UI consumer must default missing platforms to 0."

requirements-completed: [ID-03, OPS-11]

coverage:
  - id: D1
    description: "push_gate_funnel table, message_translations unique index, and messages.delivered_at column exist and are live-migrated against local Postgres"
    requirement: "OPS-11"
    verification:
      - kind: integration
        ref: "npm run migrate (applied cleanly, zero errors); psql \\d push_gate_funnel / \\d message_translations / \\d messages introspection confirmed all three"
        status: pass
    human_judgment: false
  - id: D2
    description: "gateFunnel.recordShown/recordPromptReached/recordGranted are idempotent under concurrent and repeated calls -- a stage timestamp is set at most once (ID-03)"
    requirement: "ID-03"
    verification:
      - kind: unit
        ref: "src/server/repo/gateFunnel.test.ts#gateFunnel.recordShown: a repeated call for the same visitor leaves shown_at unchanged (ID-03 idempotency)"
        status: pass
      - kind: unit
        ref: "src/server/repo/gateFunnel.test.ts#gateFunnel.recordShown: concurrent calls for the same visitor are idempotent, no duplicate rows"
        status: pass
    human_judgment: false
  - id: D3
    description: "gateFunnel.statsByPlatform aggregates shown/promptReached/granted counts per platform, recomputed fresh on every call"
    requirement: "OPS-11"
    verification:
      - kind: unit
        ref: "src/server/repo/gateFunnel.test.ts#gateFunnel.statsByPlatform: counts non-null stage columns grouped by platform, recomputed fresh"
        status: pass
    human_judgment: false
  - id: D4
    description: "pushSubscriptions repo layer (create/deleteByEndpoint/listForVisitor/markSuccess/markFailure) is race-free and re-subscribe-safe"
    verification:
      - kind: unit
        ref: "src/server/repo/pushSubscriptions.test.ts (5 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D5
    description: "vapid.ts fails loudly at import time when VAPID env vars are missing, and configures web-push once when present"
    verification:
      - kind: unit
        ref: "manual smoke test: node --experimental-strip-types -e import with/without VAPID_* env vars set (see task execution notes) -- both the success and fail-loud paths confirmed"
        status: pass
    human_judgment: false
  - id: D6
    description: "messages.markDelivered is idempotent (isNull-guarded); belongsToConversation correctly scopes a message to its conversation"
    verification:
      - kind: unit
        ref: "src/server/repo/messages.test.ts#messages.markDelivered / #messages.belongsToConversation (5 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D7
    description: "OWNER_LANG and getVisitorLangFor exist and are consumable by later plans"
    verification:
      - kind: unit
        ref: "src/server/repo/conversations.test.ts#conversations.getVisitorLangFor (3 tests, all passing)"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-07-21
status: complete
---

# Phase 2 Plan 1: Backend Substrate — Schema, VAPID Config, Push/Funnel Repo Layer Summary

**Migrated schema (push_gate_funnel, message_translations unique index, messages.delivered_at), web-push installed, and a fail-loud VAPID config seam backing race-free pushSubscriptions/gateFunnel repo modules — the shared substrate every later Phase 2 plan builds on.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-21T20:31:42Z
- **Tasks:** 3 completed
- **Files modified:** 15 (6 created, 9 modified)

## Accomplishments
- Migrated three schema additions (push_gate_funnel table, message_translations unique index, messages.delivered_at) live against local Postgres via `npm run migrate`
- Installed web-push@3.6.7 + @types/web-push@3.6.4 (exact-pinned, both verified OK per RESEARCH.md's Package Legitimacy Audit) and extended package.json's test glob for this phase's later plans
- Built a fail-loud VAPID config seam (vapid.ts) mirroring session.ts's SESSION_SECRET pattern — a missing/misconfigured VAPID key throws at import time rather than silently no-opping push
- Built race-free, idempotency-tested repo modules: pushSubscriptions.ts (endpoint-keyed upsert) and gateFunnel.ts (COALESCE-based set-once funnel stages + statsByPlatform aggregate)
- Added messages.markDelivered/belongsToConversation, config/models.ts's OWNER_LANG, and conversations.ts's getVisitorLangFor — small, targeted additions the translation and push-ack verticals need in later plans

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema additions + web-push install + migration [BLOCKING]** - `53a478c` (feat)
2. **Task 2: VAPID config + push/funnel repo layer** - `587f810` (feat)
3. **Task 3: messages.ts markDelivered + OWNER_LANG + conversations.ts getVisitorLangFor** - `7b782b8` (feat)

_No TDD tasks in this plan — all three are `type="auto"`._

## Files Created/Modified
- `src/server/db/schema.ts` - pushGateFunnel table, message_translations unique index, messages.deliveredAt column
- `src/server/push/vapid.ts` - fail-loud VAPID env validation + configured webpush export
- `src/server/repo/pushSubscriptions.ts` - create/deleteByEndpoint/listForVisitor/markSuccess/markFailure
- `src/server/repo/pushSubscriptions.test.ts` - 5 tests covering upsert-on-re-subscribe, delete, mark success/failure
- `src/server/repo/gateFunnel.ts` - recordShown/recordPromptReached/recordGranted/statsByPlatform
- `src/server/repo/gateFunnel.test.ts` - 4 tests covering set-once idempotency (sequential + concurrent) and stats aggregation
- `src/server/repo/messages.ts` - markDelivered, belongsToConversation, widened DbExecutor to include "update"
- `src/server/repo/messages.test.ts` - 5 new tests for markDelivered/belongsToConversation
- `src/server/repo/conversations.ts` - getVisitorLangFor
- `src/server/repo/conversations.test.ts` - 3 new tests for getVisitorLangFor
- `src/server/config/models.ts` - OWNER_LANG export
- `package.json` - web-push/@types/web-push dependencies, extended scripts.test glob
- `.env.example` - VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT/NEXT_PUBLIC_VAPID_PUBLIC_KEY/OWNER_LANG documented
- `docker-compose.yml` - db service's host port publish restored (loopback-only)
- `drizzle/0001_uneven_union_jack.sql` + `drizzle/meta/*` - generated migration

## Decisions Made
- docker-compose.yml's `db` service host port publish restored as loopback-only (`127.0.0.1:5433:5432`) rather than fully open — preserves Plan 01-13's production security intent (never binds 0.0.0.0) while restoring the local dev connectivity this plan's own verification steps require.
- gateFunnel.ts's set-once upserts use raw `sql` COALESCE statements (not drizzle's query builder) to exactly mirror ratelimit.ts's established race-free single-statement pattern.
- getVisitorLangFor returns `null` rather than defaulting to "en" internally — keeps the "unknown lang" signal available to the caller, per the plan's explicit instruction not to assume the fallback inside the repo function.
- statsByPlatform() does not synthesize a 0-row for an absent platform (no platform catalog table exists to LEFT JOIN against); documented in-code that Plan 02-08's UI consumer owns that fallback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored docker-compose.yml's `db` service host port publish (loopback-only)**
- **Found during:** Task 1 (running `npm run migrate` against local dev Postgres)
- **Issue:** Plan 01-13 removed `db`'s `ports:` mapping entirely to avoid exposing Postgres on a production host's public IP (docker-compose.yml is now the same file Dokploy deploys). This also made Postgres unreachable at `localhost:5433` for local dev, which this task's own [BLOCKING] verify step (`npm run migrate`) requires — Docker's default network gave the container no host-reachable port at all.
- **Fix:** Added back `ports: ["127.0.0.1:5433:5432"]` — binds only the loopback interface (never `0.0.0.0`), so it's reachable for local dev but still never exposed on a server's public IP in production.
- **Files modified:** docker-compose.yml
- **Verification:** `docker compose up -d db` + `npm run migrate` applied cleanly against local Postgres; `docker inspect` confirmed the bind is `127.0.0.1` only, not `0.0.0.0`.
- **Committed in:** 53a478c (Task 1 commit)

**2. [Rule 1 - Bug] Local dev machine's "localhost" resolves only to `::1` (IPv6), not `127.0.0.1`**
- **Found during:** Task 1 (`npm run migrate` still failed with `ECONNREFUSED ::1:5433` after the loopback bind fix above)
- **Issue:** `.env.example`/`.env.local`'s `DATABASE_URL` uses `localhost:5433`; on this specific dev machine, Node's DNS resolution of "localhost" returns only `::1`, and Docker Desktop's WSL2 backend does not support binding an IPv6 loopback port (`[::1]:5433:5432` silently produced no published port, confirmed via a manual `docker run` test). This is a local-machine DNS/Docker-networking quirk, not a defect in the checked-in `.env.example` (which uses the standard, portable `localhost` form).
- **Fix:** Did not modify `.env.local` (correctly sandboxed from Read/Edit as a secrets file) or `.env.example` (its `localhost` convention is correct for the general case). Instead, exported `DATABASE_URL=postgres://onechat:onechat@127.0.0.1:5433/onechat` as a shell environment variable for this session's own `npm run migrate`/`npm test`/`npm run build` invocations — Node's `--env-file` never overrides an already-set env var, so this required no repo changes.
- **Files modified:** None (session-local shell override only)
- **Verification:** `npm run migrate`, the full 58-test `npm test` suite, and `npm run build` all passed using this override.
- **Committed in:** N/A (not a repo change)

**3. [Rule 1 - Bug] Plan's acceptance-criteria grep patterns for Task 3 omit `async`**
- **Found during:** Task 3 (verifying acceptance criteria)
- **Issue:** The plan's acceptance criteria specify `grep -c "export function markDelivered"` and `grep -c "export function getVisitorLangFor"`, but every I/O function in this codebase (including every sibling function these two sit beside — `create`, `since`, `openFor`) is `export async function`. The literal grep as written matches zero functions in the entire existing repo layer.
- **Fix:** Implemented both functions correctly as `export async function` (matching codebase convention, and required since both `await` DB calls) and verified using the corrected grep pattern (`export async function markDelivered` / `export async function getVisitorLangFor`) instead of altering working code to satisfy a literal string that would break the codebase's own convention.
- **Files modified:** None beyond the already-correct implementation
- **Verification:** `grep -c "export async function markDelivered" src/server/repo/messages.ts` → 1; `grep -c "export async function getVisitorLangFor" src/server/repo/conversations.ts` → 1
- **Committed in:** 7b782b8 (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking infra fix, 1 local-environment DNS workaround with no repo changes, 1 acceptance-criteria grep correction)
**Impact on plan:** All necessary to complete verification as specified; no scope creep. The docker-compose.yml fix genuinely improves local dev reliability for every later plan in this phase.

## Issues Encountered
- Raw `sql`-tagged queries against the shared `db/pool.ts` client return timestamp columns as Postgres text strings, not `Date` objects — `drizzle(sql, {schema})` registers transparent parsers for timestamp OIDs on that shared client so drizzle's own query builder can apply mode-aware conversion, which incidentally strips Date parsing from any raw-`sql` query sharing the same client. This only affected `gateFunnel.test.ts`'s own verification helper (fixed by comparing strings instead of `.getTime()`) — `gateFunnel.ts`'s actual repo functions (all writes, no raw-`sql` reads returning timestamps to test) were unaffected. Documented in a code comment in the test file for future authors touching this file.
- Docker Desktop was not running at task start on this machine; started it programmatically (`Start-Process 'Docker Desktop.exe'`) and polled until the daemon was reachable before proceeding.

## User Setup Required

None for this plan specifically — the `user_setup` block in 02-01-PLAN.md's frontmatter documents that the **owner** must generate the production VAPID keypair off-box before Phase 2's production deployment (D-01/D-02), but that is a production-deployment prerequisite, not something blocking this plan's local execution. `.env.example` documents the four VAPID-related env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) with the build-time/runtime split rationale for when that setup happens.

## Next Phase Readiness
- Every later Phase 2 plan (02-02 through 02-08) can now import: `src/server/push/vapid.ts`'s configured `webpush`, `src/server/repo/pushSubscriptions.ts`'s CRUD functions, `src/server/repo/gateFunnel.ts`'s funnel-recording functions and `statsByPlatform()`, `src/server/repo/messages.ts`'s `markDelivered`/`belongsToConversation`, `src/server/config/models.ts`'s `OWNER_LANG`, and `src/server/repo/conversations.ts`'s `getVisitorLangFor`.
- The migrated schema is live against local dev Postgres; no later plan will discover a missing column mid-task.
- No blockers. Local dev Postgres connectivity is now reliable (loopback-only port publish); a future contributor on a machine where `localhost` resolves to `::1` only will hit the same DNS quirk documented above and should apply the same session-local `DATABASE_URL` override (or use `127.0.0.1` directly) rather than editing `.env.local`'s `localhost` convention.

---
*Phase: 02-reachability-and-language*
*Completed: 2026-07-21*
