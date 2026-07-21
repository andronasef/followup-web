---
phase: 02-reachability-and-language
plan: 04
subsystem: push
tags: [web-push, vapid, jose, zod, node-test]

# Dependency graph
requires:
  - phase: 02-reachability-and-language
    provides: "02-01's schema (push_subscriptions, push_gate_funnel, messages.delivered_at), vapid.ts's configured webpush export, pushSubscriptions.ts/gateFunnel.ts repo layer, session.ts's signVisitorId/verifySession"
provides:
  - "src/server/push/subscribe.ts: handleSubscribe -- upserts a push subscription, fires the PUSH-12 synchronous probe with a content-free payload, unconditionally records gateFunnel.recordGranted"
  - "src/server/push/gateEvent.ts: handleGateEvent -- records shown/prompt_reached funnel stages"
  - "src/server/push/send.ts: sendPushToVisitor -- ACK-grace-period-aware, 404/410-self-healing live push sender; buildContentFreePayload shared shape; ACK_GRACE_PERIOD_MS"
  - "src/app/api/push/subscribe/route.ts, src/app/api/push/gate-event/route.ts -- thin requireVisitor()-guarded route wrappers"
  - "src/lib/push/subscribe-client.ts -- subscribeToPush/syncSubscriptionOnOpen/sendGateEventBeacon/detectPlatform/urlBase64ToUint8Array client helpers"
  - "src/server/repo/messages.ts: getDeliveredAt (additive sibling to markDelivered)"
affects: [02-05, 02-06, 02-07, 02-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "next/headers-free service module + thin route.ts wrapper split (01-08 precedent), applied to both push routes"
    - "Content-free push payload built once from getStrings(lang) + a signVisitorId-signed data.vid token, shared via buildContentFreePayload so subscribe.ts's probe and send.ts's live sends never diverge in shape"
    - "Injectable async seam (send.ts's `wait` parameter, defaulting to the real timer) as the test-friendly alternative to node:test's global mock.timers, used when the faked API would also interfere with unrelated async I/O (here: the DB driver's own internal setTimeout calls)"

key-files:
  created:
    - src/server/push/subscribe.ts
    - src/server/push/subscribe.test.ts
    - src/server/push/gateEvent.ts
    - src/server/push/gateEvent.test.ts
    - src/server/push/send.ts
    - src/server/push/send.test.ts
    - src/app/api/push/subscribe/route.ts
    - src/app/api/push/gate-event/route.ts
    - src/lib/push/subscribe-client.ts
    - src/lib/push/subscribe-client.test.ts
  modified:
    - src/server/repo/messages.ts
    - src/lib/i18n/strings.ts
    - package.json

key-decisions:
  - "src/lib/i18n/strings.ts's JSON imports gained `with { type: \"json\" }` import attributes -- plain Node's ESM loader has required this since Node 22 and threw ERR_IMPORT_ATTRIBUTE_MISSING the moment a next/headers-free, node:test-run module (subscribe.ts) imported getStrings for the first time. Additive syntax; Next's bundler and TypeScript 6 both already support it, so every existing client-component caller of getStrings is unaffected."
  - "sendPushToVisitor takes an optional 5th `wait` parameter (default: the real ACK_GRACE_PERIOD_MS timer) instead of relying on node:test's global mock.timers -- empirically confirmed that faking setTimeout globally also freezes the DB driver's own internal setTimeout calls made by the repo queries this function runs after the grace period, hanging every test past the tick. All production call sites use the 4-arg default; this is a test-only seam."
  - "urlBase64ToUint8Array's return type pinned to Uint8Array<ArrayBuffer> (not a bare Uint8Array) -- required by npm run build's TypeScript pass: applicationServerKey needs BufferSource (ArrayBufferView<ArrayBuffer>), which a bare Uint8Array no longer satisfies under this project's TS/DOM-lib versions (default generic widened to ArrayBufferLike, which also covers SharedArrayBuffer)."
  - "Local dev VAPID keypair (throwaway, not the production key) exported as session-local shell env vars for this plan's own `--env-file=.env.local`-based test runs, never written into .env.local or committed -- .env.local lacks VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT values, and both Read and Bash access to that file are sandboxed from this agent. Mirrors 02-01-SUMMARY.md's session-local DATABASE_URL override precedent. A future contributor on a fresh clone needs to set these three vars locally (or run `npx web-push generate-vapid-keys` for a throwaway dev key) before src/server/push/*.test.ts can import vapid.ts."

requirements-completed: [PUSH-07, PUSH-09, PUSH-10, PUSH-11, PUSH-12, OPS-11]

coverage:
  - id: D1
    description: "handleSubscribe upserts a push subscription, fires the PUSH-12 synchronous probe with a content-free payload, and returns {probeOk:true|false} (always 200, never an error status) based on the probe send's own success/failure"
    requirement: "PUSH-12"
    verification:
      - kind: unit
        ref: "src/server/push/subscribe.test.ts#handleSubscribe: a well-formed subscription upserts a row and returns probeOk:true when the probe succeeds"
        status: pass
      - kind: unit
        ref: "src/server/push/subscribe.test.ts#handleSubscribe: returns {status:200, body:{probeOk:false}} (never an error status) when the probe send throws"
        status: pass
    human_judgment: false
  - id: D2
    description: "gateFunnel.recordGranted is called unconditionally on every handleSubscribe call, regardless of probe outcome"
    requirement: "OPS-11"
    verification:
      - kind: unit
        ref: "src/server/push/subscribe.test.ts#handleSubscribe: calls gateFunnel.recordGranted exactly once per call, on both the success and probe-failure paths"
        status: pass
    human_judgment: false
  - id: D3
    description: "The probe payload's data.vid field is a real signVisitorId-signed JWT, decodable back to the same visitorId via verifySession -- never null"
    requirement: "PUSH-12"
    verification:
      - kind: unit
        ref: "src/server/push/subscribe.test.ts#handleSubscribe: the probe payload's data.vid is a real signVisitorId-signed JWT decodable back to the same visitorId"
        status: pass
    human_judgment: false
  - id: D4
    description: "A malformed subscription body (missing endpoint or keys) is rejected with 400 before any DB write"
    requirement: "PUSH-12"
    verification:
      - kind: unit
        ref: "src/server/push/subscribe.test.ts#handleSubscribe: rejects a malformed subscription body (missing endpoint or keys) with {status:400}"
        status: pass
    human_judgment: false
  - id: D5
    description: "handleGateEvent records shown/prompt_reached funnel stages via gateFunnel and rejects an unknown kind with 400"
    requirement: "OPS-11"
    verification:
      - kind: unit
        ref: "src/server/push/gateEvent.test.ts (3 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D6
    description: "sendPushToVisitor skips sending entirely when messages.delivered_at is already non-null (PUSH-08's grace-period ack check)"
    requirement: "PUSH-09"
    verification:
      - kind: unit
        ref: "src/server/push/send.test.ts#sendPushToVisitor: skips sending entirely if messages.deliveredAt is already non-null"
        status: pass
    human_judgment: false
  - id: D7
    description: "sendPushToVisitor sends to every subscription for a visitor independently -- a 404/410 deletes that subscription without blocking other subscriptions' attempts; any other error only marks failure and never deletes the row"
    requirement: "PUSH-10"
    verification:
      - kind: unit
        ref: "src/server/push/send.test.ts#sendPushToVisitor: sends to every subscription in listForVisitor(visitorId) when deliveredAt is still null"
        status: pass
      - kind: unit
        ref: "src/server/push/send.test.ts#sendPushToVisitor: a 404/410 deletes that subscription and does not throw further -- other subscriptions still attempted"
        status: pass
      - kind: unit
        ref: "src/server/push/send.test.ts#sendPushToVisitor: a non-404/410 error marks failure and does not delete the row"
        status: pass
    human_judgment: false
  - id: D8
    description: "The live-send payload never contains the triggering message's own body text, and every subscription in one call receives the same signed data.vid token (signed once per call, not per subscription)"
    requirement: "PUSH-07"
    verification:
      - kind: unit
        ref: "src/server/push/send.test.ts#sendPushToVisitor: the payload never contains the triggering message's own body text"
        status: pass
      - kind: unit
        ref: "src/server/push/send.test.ts#sendPushToVisitor: every subscription receives the SAME signed data.vid token, signed once per call"
        status: pass
    human_judgment: false
  - id: D9
    description: "subscribe-client.ts's syncSubscriptionOnOpen is silent on every branch (null subscription, unchanged endpoint, changed endpoint) and re-POSTs exactly once when the endpoint changed; subscribeToPush wires serviceWorker.ready -> pushManager.subscribe() -> POST and never throws; sendGateEventBeacon posts a correctly-shaped beacon"
    requirement: "PUSH-11"
    verification:
      - kind: unit
        ref: "src/lib/push/subscribe-client.test.ts (7 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D10
    description: "npm run build succeeds with both new routes (/api/push/subscribe, /api/push/gate-event) registered"
    verification:
      - kind: integration
        ref: "npm run build (Turbopack production build) -- Compiled successfully, TypeScript passed, both routes listed in the route table"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-07-21
status: complete
---

# Phase 2 Plan 4: Push Subscribe/Probe/Send Backend + Client Helpers Summary

**Content-free-by-construction push subscribe/probe/send pipeline (web-push 3.6.7) plus the client-side subscribe/re-sync/beacon helpers Plan 02-07's Gate.tsx will wire in — the vertical slice proving a granted subscription genuinely works end-to-end at the backend/client-helper layer.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-21T22:09:40Z
- **Tasks:** 3 completed
- **Files modified:** 13 (10 created, 3 modified)

## Accomplishments
- Built `subscribe.ts`'s `handleSubscribe` — upserts a `push_subscriptions` row, fires the PUSH-12 synchronous round-trip probe with a content-free payload (fixed locale strings + a fresh `signVisitorId`-signed `data.vid` token), and unconditionally records `gateFunnel.recordGranted` regardless of probe success or failure
- Built `gateEvent.ts`'s `handleGateEvent` for the shown/prompt-reached funnel beacon, plus both routes' thin `requireVisitor()`-guarded `route.ts` wrappers
- Built `send.ts`'s `sendPushToVisitor` — waits out `ACK_GRACE_PERIOD_MS`, re-checks `messages.delivered_at` (skip if already acked), then sends to every subscription independently: a 404/410 deletes the dead row (PUSH-10), any other error only marks failure, and every subscription in one call reuses the same signed `vid` token (signed once, not per subscription)
- Built `subscribe-client.ts`'s `subscribeToPush`/`syncSubscriptionOnOpen`/`sendGateEventBeacon`/`detectPlatform`/`urlBase64ToUint8Array` — the client-side helpers Plan 02-07's Gate UI calls directly, silent on every branch per D-15/D-16
- Added `messages.ts`'s `getDeliveredAt` (additive sibling to `markDelivered`, as the plan's own action text called for)
- Fixed a real Node-ESM blocker in `strings.ts` (JSON imports needed `with { type: "json" }` to resolve under plain `node --test`) and a real TS build error in `subscribe-client.ts` (`Uint8Array<ArrayBuffer>` pinning) — both discovered and fixed during this plan's own verification steps, not pre-existing bugs left behind

## Task Commits

Each task followed the RED -> GREEN TDD cycle, committed atomically:

1. **Task 1: subscribe.ts + gateEvent.ts + route wrappers**
   - `ef25863` (test) — subscribe.ts/gateEvent.ts tests (RED)
   - `3744c4b` (feat) — implementation + route wrappers (GREEN)
2. **Task 2: send.ts — ACK-aware, 404/410-cleanup push sender**
   - `28545e4` (test) — send.ts tests (RED)
   - `aab5c5b` (feat) — implementation + messages.ts's getDeliveredAt (GREEN)
3. **Task 3: subscribe-client.ts — client subscribe/re-sync/beacon helpers**
   - `00d8b20` (test) — subscribe-client.ts tests (RED)
   - `7a6c2b5` (feat) — implementation + package.json test-glob fix (GREEN)

**Build-fix follow-up:** `84b4011` (fix) — `urlBase64ToUint8Array`'s `Uint8Array<ArrayBuffer>` return type, found by `npm run build`'s own TypeScript pass.

_No separate "Plan metadata" commit yet — this SUMMARY's own commit closes out the plan._

## Files Created/Modified
- `src/server/push/subscribe.ts` - `handleSubscribe`: upsert + PUSH-12 probe + unconditional `recordGranted`
- `src/server/push/subscribe.test.ts` - 5 tests
- `src/server/push/gateEvent.ts` - `handleGateEvent`: shown/prompt_reached funnel recording
- `src/server/push/gateEvent.test.ts` - 3 tests
- `src/server/push/send.ts` - `sendPushToVisitor`, `ACK_GRACE_PERIOD_MS`, `buildContentFreePayload`
- `src/server/push/send.test.ts` - 6 tests
- `src/app/api/push/subscribe/route.ts` - thin `requireVisitor()`-guarded wrapper
- `src/app/api/push/gate-event/route.ts` - thin `requireVisitor()`-guarded wrapper
- `src/lib/push/subscribe-client.ts` - `urlBase64ToUint8Array`, `detectPlatform`, `subscribeToPush`, `syncSubscriptionOnOpen`, `sendGateEventBeacon`
- `src/lib/push/subscribe-client.test.ts` - 7 tests
- `src/server/repo/messages.ts` - added `getDeliveredAt`
- `src/lib/i18n/strings.ts` - JSON imports gained `with { type: "json" }` import attributes
- `package.json` - added `src/lib/push/*.test.ts` to the `test` script glob

## Decisions Made
- `strings.ts`'s JSON imports gained `with { type: "json" }` import attributes so `getStrings` resolves under plain Node (not just Next's bundler) — required the moment a `next/headers`-free, `node:test`-run module (`subscribe.ts`) imported it for the first time in this codebase.
- `sendPushToVisitor` takes an optional 5th `wait` parameter (default: the real `ACK_GRACE_PERIOD_MS` timer) rather than using `node:test`'s global `mock.timers` — confirmed empirically that faking `setTimeout` globally also freezes the Postgres driver's own internal `setTimeout` calls, hanging every test past the tick. Production callers are unaffected (all invoke with the 4-arg default).
- `urlBase64ToUint8Array`'s return type pinned to `Uint8Array<ArrayBuffer>` — `npm run build`'s TypeScript pass rejected a bare `Uint8Array` against `applicationServerKey`'s `BufferSource` requirement under this project's TS/DOM-lib versions.
- A throwaway local dev VAPID keypair was exported as session-local shell env vars for this plan's own test runs (never written to `.env.local`, never committed) — `.env.local` lacks real `VAPID_*` values and is fully sandboxed from this agent's Read/Bash access. See "User Setup Required" below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `strings.ts`'s JSON imports needed `with { type: "json" }` for `node:test` runnability**
- **Found during:** Task 1 (writing `subscribe.ts`, which the plan's own action text requires to import `getStrings` for the notification title/body)
- **Issue:** `import en from "./locales/en.json";` (no import attribute) throws `ERR_IMPORT_ATTRIBUTE_MISSING` under plain `node --experimental-strip-types` (Node has required an explicit `type: "json"` import attribute for `.json` specifiers since Node 22). This had never surfaced before because no prior server module imported `strings.ts` directly — only client components did, going through Next's bundler.
- **Fix:** Added `with { type: "json" }` to all 10 locale imports in `strings.ts`. Standard ESM syntax; TypeScript 6 and Next's bundler both already accept it, confirmed via `npm run build`.
- **Files modified:** `src/lib/i18n/strings.ts`
- **Verification:** `node --experimental-strip-types -e "import('./src/lib/i18n/strings.ts')..."` resolves; `npm run build` compiles and type-checks cleanly.
- **Committed in:** `3744c4b` (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] `node:test`'s global `mock.timers` hangs every test that also queries the DB after the tick**
- **Found during:** Task 2 (`send.test.ts`'s first draft used `t.mock.timers.enable({apis:['setTimeout']})` per the plan's own acceptance-criteria hint to "mock/fake the grace-period timer")
- **Issue:** Faking `setTimeout` globally intercepts the Postgres driver's own internal `setTimeout` calls (confirmed via an isolated repro: a real DB query issued after a successful `tick()` never resolves, `node:test` reports `Promise resolution is still pending but the event loop has already resolved`).
- **Fix:** Added an optional 5th `wait: () => Promise<void>` parameter to `sendPushToVisitor`, defaulting to the real timer-based delay; tests pass `() => Promise.resolve()` instead of faking global timers. All production call sites (none exist yet outside tests — Plan 02-06 wires the real caller) use the 4-arg default, so this is additive, not a behavior change.
- **Files modified:** `src/server/push/send.ts`, `src/server/push/send.test.ts`
- **Verification:** `node --experimental-strip-types --env-file=.env.local --test src/server/push/send.test.ts` — all 6 tests pass in ~2.5s (vs. hanging indefinitely with the global-mock approach).
- **Committed in:** `aab5c5b` (Task 2 GREEN commit)

**3. [Rule 1 - Bug] `npm run build`'s TypeScript pass rejected `urlBase64ToUint8Array`'s bare `Uint8Array` return type**
- **Found during:** the plan's own overall `<verification>` step (`npm run build succeeds`)
- **Issue:** `Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'string | BufferSource | null | undefined'` — `applicationServerKey` requires `ArrayBufferView<ArrayBuffer>`, which a bare `Uint8Array` no longer satisfies under this project's TS/DOM-lib versions (the type's default generic widened to include `SharedArrayBuffer`).
- **Fix:** Pinned both the function's return type and the local variable's type annotation to `Uint8Array<ArrayBuffer>`.
- **Files modified:** `src/lib/push/subscribe-client.ts`
- **Verification:** `npm run build` — compiles and type-checks cleanly, both new routes appear in the route table.
- **Committed in:** `84b4011` (separate fix commit, found after Task 3's GREEN commit during final plan-level verification)

**4. [Rule 2 - Missing Critical] `package.json`'s `test` script glob was missing `src/lib/push/*.test.ts`**
- **Found during:** Task 3
- **Issue:** The glob already anticipated this phase's other new push-related test directories (`src/app/api/push/subscribe/*.test.ts`, `gate-event`, `recover`) but not `src/lib/push/`, which would have silently excluded `subscribe-client.test.ts` from every future `npm test` run.
- **Fix:** Added `src/lib/push/*.test.ts` to the glob.
- **Files modified:** `package.json`
- **Verification:** `npm run build`'s own tsc/lint pass unaffected; confirmed the new test file is now included by inspecting the updated glob string.
- **Committed in:** `7a6c2b5` (Task 3 GREEN commit)

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 bug, 1 missing-critical). All necessary to complete the plan's own specified verification steps; no scope creep.
**Impact on plan:** None of these changed any must-have behavior — all four are toolchain/runtime-compatibility fixes discovered while making the plan's own acceptance criteria and `<verification>` block actually pass.

## Issues Encountered
- `.env.local` has no `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` values set (both blank per `.env.example`'s template), and both the `Read` and `Bash` tools are sandboxed from touching `.env.local` at all in this environment. `vapid.ts` throws at import time without them (by design — see 02-01's fail-loud pattern), which blocked every `src/server/push/*.test.ts` run. Resolved the same way 02-01-SUMMARY.md resolved its own local-env quirk: exported a throwaway dev-only VAPID keypair (`npx web-push generate-vapid-keys`) as session-local shell environment variables before invoking `node --test`, with zero `.env.local`/repo changes. This is **not** the production keypair and carries none of D-01/D-02/D-03's permanence guarantees — it only exists for this session's local test runs.
- The default `npm test` script (all files, default concurrency) intermittently fails a subset of unrelated tests with `CONNECTION_ENDED` against the local Postgres's `max: 10` pool — this is the exact known artifact documented in this plan's own environment note, confirmed by re-running the identical file set with `--test-concurrency=1`, which passed all 105 tests cleanly. No real regression.

## User Setup Required

**Local dev VAPID keypair not persisted.** This plan's own test runs used a throwaway VAPID keypair set only as session-local shell environment variables (never written to `.env.local`, never committed). A future contributor (or the next session) running `src/server/push/*.test.ts` locally needs their own `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` set — either by adding a throwaway dev keypair (`npx web-push generate-vapid-keys`) to their own `.env.local`, or exporting them in-shell before running tests. This is separate from D-01/D-02/D-03's **production** VAPID keypair requirement (owner-generated, off-box, permanent), which remains untouched by this plan.

## Next Phase Readiness
- Plan 02-05 (translation wiring) is unaffected by this plan and can proceed independently.
- Plan 02-06 (admin reply + push trigger) can now import `send.ts`'s `sendPushToVisitor` directly from its `after()` hook — the PUSH-08 grace-period check, the content-free payload, and the 404/410 cleanup are all already built and tested; Plan 02-06 only needs to call it with the right `conversationId`/`messageId`/`visitorId`/`lang`, per this plan's own `key_links` promise.
- Plan 02-07 (Gate.tsx UI) can now import `subscribe-client.ts`'s `subscribeToPush`/`syncSubscriptionOnOpen`/`sendGateEventBeacon`/`detectPlatform` directly — all are silent-on-failure per D-15/D-16 and independently tested with no server dependency.
- No blockers. The two toolchain fixes (JSON import attributes, `Uint8Array<ArrayBuffer>` typing) are durable — they don't need to be rediscovered by a later plan that also imports `strings.ts` from a server module or builds another `applicationServerKey`-shaped value.

---
*Phase: 02-reachability-and-language*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 10 created source/test files confirmed present on disk; all 7 commits (ef25863, 3744c4b, 28545e4, aab5c5b, 00d8b20, 7a6c2b5, 84b4011) confirmed in git history.
