---
phase: quick-260723-0vf
plan: 01
status: complete
subsystem: push-identity, realtime-sse, auth-security, translation
tags: [bugfix, security, availability, data-loss, code-review]
requires:
  - src/server/repo/pushSubscriptions.ts
  - src/server/repo/ratelimit.ts
  - src/server/realtime/hub.ts
provides:
  - src/server/realtime/sse-pump.ts (shared, never-rejecting DB-backed SSE pump)
  - src/server/http/ip.ts (shared clientIp/hashIp, layer-neutral)
  - src/app/api/admin/login/login.ts (next/headers-free login behavior + throttle)
  - visitors.updatePrefs (manual lang/appearance persistence)
  - SubscribeOutcome union (client-visible push identity-binding result)
affects:
  - src/app/api/chat/stream/route.ts
  - src/app/api/admin/stream/route.ts
  - src/app/api/admin/login/route.ts
  - src/app/api/chat/prefs/route.ts
  - src/components/chat/Gate.tsx
  - public/sw.js
tech-stack:
  added: []
  patterns:
    - "Endpoint-to-visitor push binding is set-once at insert; a mismatched subscribe is a 409, never a silent rebind."
    - "SSE pump extracted as an injectable, next/headers-free module whose run() never rejects; errors recycle the stream rather than crash the replica."
    - "Hub unsubscribe handles are double-call-safe and identity-checked against the captured Set."
    - "Rate-limit checks run as the FIRST action of a handler, before any expensive verify."
key-files:
  created:
    - src/server/realtime/sse-pump.ts
    - src/server/realtime/sse-pump.test.ts
    - src/server/realtime/hub.test.ts
    - src/server/http/ip.ts
    - src/server/http/ip.test.ts
    - src/app/api/admin/login/login.ts
    - src/app/api/admin/login/login.test.ts
  modified:
    - src/server/repo/pushSubscriptions.ts
    - src/server/repo/visitors.ts
    - src/server/push/subscribe.ts
    - src/server/push/send.ts
    - src/lib/push/subscribe-client.ts
    - src/components/chat/Gate.tsx
    - public/sw.js
    - src/server/realtime/hub.ts
    - src/app/api/chat/stream/route.ts
    - src/app/api/admin/stream/route.ts
    - src/app/api/chat/prefs/route.ts
    - src/app/api/admin/login/route.ts
    - src/app/api/chat/messages/send.ts
    - src/server/translation/translate.ts
    - package.json
decisions:
  - "handleAdminLogin's 429 is proven to precede the credential path behaviorally (correct credentials still get 429) plus a timing assertion, not by mocking verifyPassword — ES module namespace objects are not mockable via t.mock.method."
  - "Login throttle: capacity 10, refill 0.1 tokens/sec (1 per 10s), keyed on hashIp(ip) only — never on email."
  - "maxTokensFor uses CODEPOINTS_PER_TOKEN=2, EXPANSION_ALLOWANCE=2.5, JSON_ENVELOPE_TOKENS=64, floor 256, hard cap 5064 — derived locally from the 4000-codepoint message bound, not imported across the server/app boundary."
metrics:
  duration: ~75min
  tasks: 3
  files: 22
  completed: 2026-07-23
---

# Quick Task 260723-0vf: Fix 8 Code-Review Findings Summary

Closed eight verified code-review findings across the push/identity, SSE realtime, security, and translation subsystems in three atomic commits — including a push-endpoint visitor takeover that permanently orphaned conversations and an unhandled rejection that could kill the single-replica container.

## Commits

| Task | Findings | Commit | Files |
|------|----------|--------|-------|
| 1 | CR-01, CR-02, CR-08 | `9b42fa4` | 13 |
| 2 | CR-04, CR-05, CR-06 | `dd6e98e` | 8 |
| 3 | CR-03, CR-07 | `d61186c` | 9 |

## What Changed

### Task 1 — push identity, language persistence, notification tag (`9b42fa4`)

**CR-01 (critical, data loss).** `pushSubscriptions.create()`'s `onConflictDoUpdate` no longer writes `visitorId` — the endpoint-to-visitor binding is now set-once at insert, so the row `create()` returns may carry a *different* owner than the caller. `handleSubscribe()` compares the two and returns a new `{status: 409, body: {error: "endpoint_owned_by_other_visitor"}}` **before** the probe send and **before** `gateFunnel.recordGranted` — so a mistakenly-minted visitor neither fires a notification at the real owner's device nor pollutes the funnel.

Client side: `subscribe-client.ts` exports a `SubscribeOutcome` union (`ok`/`conflict`/`skipped`/`failed`); `syncSubscriptionOnOpen` now resolves to it instead of `void`, and `subscribeToPush` resolves to `{outcome, probeOk}` instead of `{probeOk} | null`. `Gate.tsx`'s two concurrent mount IIFEs collapsed into one sequential async IIFE with an extracted `recoverIdentityByEndpoint()` helper: ID-03 recovery runs first (still gated on `data-cookie-present === "0"`) and reloads on success; only otherwise does the PUSH-11 re-sync run; a reported `conflict` from either that re-sync or `handleAllow`'s `subscribeToPush` triggers recovery too. Recovery now wins the race deterministically instead of by luck, and the set-once binding makes the outcome safe even if a future caller violates the ordering.

**CR-02.** Added `visitors.updatePrefs(visitorId, lang?, appearance?)` — a single UPDATE writing only the supplied non-null arguments, also touching `lastSeenAt`, returning the row or `null` (silent no-op, never an insert) when nothing matched. Called from `/api/chat/prefs`'s PATCH right after `requireVisitor()` and before signing the cookie. This is what makes `getVisitorLangFor()`, `getVisitorAndLangFor()` and `handleRecover()` read the visitor's actual choice rather than the Accept-Language guess frozen at insert. No schema change — both columns already existed.

**CR-08.** `buildContentFreePayload(lang, vid, tag)` now emits a top-level `tag` (`data: {vid}` unchanged, so ID-05/T-02-12 hold — the tag is a routing key, never content). Both call sites pass the same value they use as the web-push `topic` (`conv-<id>` / `probe-<visitorId>`), and `subscribe.ts`'s probe finally calls the shared builder instead of hand-rolling its own object. `sw.js` reads `data.tag` (falling back to no tag when absent or non-string) instead of the `data.data.conversationId` the payload has never carried; `showNotification` stays unconditional.

### Task 2 — SSE pump and hub (`dd6e98e`)

Extracted the pump duplicated across both stream routes into `src/server/realtime/sse-pump.ts`, exporting `createPump({sinceId, fetchSince, emit, onError})` with `run()`/`trigger()`/`highWaterMark()`.

**CR-04.** The whole drain loop is wrapped; `run()` **never rejects**, the error goes to `onError`, and the in-flight flag is released in `finally`. The old `void pump()` from a hub callback turned a transient DB error into an unhandled rejection — process-fatal on Node 24, taking the single replica and every other visitor's stream with it. Both routes' `onError` logs ids/status only (never message bodies, per CLAUDE.md's pino redaction rule) and calls `cleanup()`, so EventSource reconnects and replays from its `Last-Event-ID`.

**CR-05.** The module has no live/not-live concept. The single `rerun` flag is the only handoff, so a trigger arriving mid-run — including during the very first backfill run — is always honored by that run. The old `gotEventDuringBackfill` boolean was consumed by exactly one extra pass; a message committed during *that* pass set an already-true flag which was then discarded and waited for the 4-minute recycle.

**CR-06.** `hub.subscribe`/`subscribeAll` unsubscribe handles now carry a closure-local `done` flag (second call is a no-op), and `subscribe`'s map cleanup is identity-checked: it only deletes the conversation entry when the map still holds the exact `Set` the closure captured *and* that Set is empty. Both the abort listener and `cancel()` fire the same handle, so without these a late second call could delete the registration a freshly reconnected stream had just created — silently deafening it while heartbeat and backfill kept working.

Both routes now build the pump, `trigger()` unconditionally from the hub callback, and `await pump.run()` once. Subscribe-before-backfill ordering, presence handling, heartbeat, 4-minute recycle, and abort/cancel cleanup are all unchanged.

### Task 3 — login throttle and translation token budget (`d61186c`)

**CR-03.** Moved `clientIp`/`hashIp` verbatim into a new `src/server/http/ip.ts` (T-01-25 header note preserved); `send.ts` imports and re-exports both, so `route.ts` and existing tests are unaffected and the admin login path never imports the visitor chat send module. Split the login route the way every other write route in this repo is split: `login.ts` (`next/headers`-free, exporting `handleAdminLogin({ip, rawBody})` returning `{status, body}` plus `cookieValue` on success — the same shape as `recover.ts`) plus a thin `route.ts` wrapper. The zod schema, module-scope dummy hash, non-enumerating `invalidCredentials` convergence, and `signOwnerSession` moved across unchanged.

As `handleAdminLogin`'s **first** action — before the responder lookup, before any `verifyPassword` — it calls the existing `check()` with key `admin-login:${hashIp(ip)}`, capacity 10, refill 0.1/sec. Keyed on the hashed IP **only**: a per-email bucket would let any attacker lock the single owner out from another IP and would turn the 429 into an account-existence oracle. `proxy.ts` needed no change.

**CR-07.** Replaced `max_tokens: 500` with an exported `maxTokensFor(text)` sized to the input measured in **code points** (matching `MAX_MESSAGE_CODEPOINTS`'s own 4000-code-point bound), with a 256-token floor, a 64-token JSON-envelope allowance, a 2.5× expansion allowance covering the upper end of `lengthRatioOk`'s accepted band, and a 5064-token hard cap. Constants are defined locally with a comment naming the bound they derive from — no import across the server/app boundary. No validator or threshold was retuned; the fix exists precisely so a long message stops failing them by truncation, which marked the row failed and tripped `circuit-breaker.recordFailure()`, suppressing translation for short messages too. `translate-preview.ts` gets the fix for free.

## Verification Results

Reported honestly, including the environment work that was needed.

| Check | Result |
|-------|--------|
| `npm test` (full suite) | **PASS** — 198 tests, 198 pass, 0 fail, 0 skipped |
| `npx tsc --noEmit --ignoreDeprecations 6.0` | **PASS** — clean, zero errors |
| `npx tsc --noEmit` (bare) | **FAILS on a pre-existing tsconfig error** — see below |
| `npm run build` | **PASS** — all 22 routes compiled, TypeScript finished in 5.0s |
| Task 1 file assertions (`sw.js` tag, prefs `updatePrefs`) | PASS |
| Task 2 file assertions (no `gotEventDuringBackfill`, `createPump` in both routes, realtime test glob) | PASS |
| Task 3 file assertions (no `max_tokens: 500`, both new test globs) | PASS |
| New deletions in any commit | None (`git diff --diff-filter=D` empty across all three) |
| New runtime dependency | None — `package.json` changed only in the `test` script glob |
| New `drizzle/` migration | None — `visitors.lang`/`visitors.appearance` already existed |

### The bare `npx tsc --noEmit` failure is pre-existing and unrelated

```
tsconfig.json(26,5): error TS5101: Option 'baseUrl' is deprecated and will stop
functioning in TypeScript 7.0. Specify compilerOption '"ignoreDeprecations": "6.0"'
to silence this error.
```

Confirmed present on the clean tree at `f3e2b0c` before any change in this task. It is a `tsconfig.json` config-level error with nothing to do with these eight findings, and `tsconfig.json` is not in this plan's file list, so it was left alone rather than silently amended. **With `--ignoreDeprecations 6.0` the typecheck is completely clean** — and `npm run build`, which runs Next's own TypeScript pass, succeeds. Adding `"ignoreDeprecations": "6.0"` to `tsconfig.json` is a one-line fix whenever the user wants it.

### Environment work required to run the suite

Three things had to be sorted out before the DB-backed tests could run at all; none required a code change:

1. **Docker Desktop was not running** — started it; `web-db-1` came up on `127.0.0.1:5433`.
2. **`DATABASE_URL` uses `localhost`, which Windows resolves to `::1` first**, while the container publishes on IPv4 `127.0.0.1` only — every repo test failed with `ECONNREFUSED ::1:5433`. Worked around per-run by exporting `DATABASE_URL` with the host rewritten to `127.0.0.1` (shell env takes precedence over `--env-file`). **`.env.local` was not modified.** This is a pre-existing local-dev papercut; changing `localhost` → `127.0.0.1` in `.env.local` would fix it permanently.
3. **`.env.local` has no VAPID keys**, so `vapid.ts` throws at module load and `send.test.ts`/`subscribe.test.ts` cannot even import. Generated a throwaway keypair with `web-push generate-vapid-keys` and exported it for the test/build runs only — **nothing was written to `.env.local` or committed**.

## Deviations from Plan

**1. [Rule 3 — Blocking] Fixed a pre-existing TS7023/TS2339 pair in `subscribe-client.test.ts`**

- **Found during:** Task 2 verification
- **Issue:** The existing `pushManager.subscribe` mock used `toJSON() { return { endpoint: this.endpoint }; }` inside an object literal returned from an async arrow. TS types `this` there as the awaited-or-thenable union, so the property lookup failed (TS2339) and the self-referential return inferred as `any` (TS7023). Present on the clean tree; it kept every task's `npx tsc --noEmit` done-criterion from being satisfiable.
- **Fix:** Hoisted the endpoint to a `MOCK_ENDPOINT` constant and made `toJSON` an arrow returning it directly. Behaviorally identical; test still passes.
- **File:** `src/lib/push/subscribe-client.test.ts` — **Commit:** `dd6e98e` (Task 2, because the file is a Task 1 file already committed by then)

**2. [Rule 3 — Blocking] `handleAdminLogin`'s "no verify runs" assertion proven behaviorally, not by mocking**

- **Found during:** Task 3
- **Issue:** The plan's behavior spec asks that the 429 path perform no responder lookup or password verification. `t.mock.method` cannot patch `verifyPassword`/`findByEmail` — ES module namespace objects are read-only, and `login.ts` binds the imports at module load anyway.
- **Fix:** Two observable assertions instead. (a) With the bucket exhausted, **correct** credentials still return 429 with no `cookieValue` — only possible if the throttle precedes the credential path, since running after would return 200. (b) The 429 path is asserted to complete in under half the wall time of an allowed 401, which is a direct measurement of the Argon2id cost being skipped — exactly the DoS property the throttle exists to provide.
- **File:** `src/app/api/admin/login/login.test.ts` — **Commit:** `d61186c`

No architectural (Rule 4) decisions were needed. No authentication gates were hit.

## Known Stubs

None. Every changed code path is fully wired; no placeholder values, TODOs, or unwired components were introduced.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern, or trust-boundary schema change was introduced beyond what the plan's `<threat_model>` already registered. The one new response status (`409` from `/api/push/subscribe`) is a *narrowing* of existing behavior — it refuses work that previously succeeded — and is covered by T-0vf-01.

## Success Criteria — All 8 Findings Closed

1. **CR-01 endpoint takeover** — repo test proves the binding is set-once (owner keeps the row, keys still refresh, intruder acquires nothing); subscribe test proves the 409 / no-probe / no-funnel branch and that the same-owner path is unchanged.
2. **CR-02 lang persistence** — three repo tests prove the write, the leave-untouched semantics, and the no-insert-on-unknown-id no-op; file assertion proves the prefs route calls it.
3. **CR-03 login rate limit** — login tests prove 429 before the credential path (via correct credentials + timing), the generic non-oracle 429 body, and that an attacker's IP storm never locks the owner out from another IP.
4. **CR-04 unhandled rejection** — pump tests prove `run()` resolves on a rejecting fetcher, `onError` fires exactly once, and the in-flight flag is released so the next run is not deadlocked.
5. **CR-05 backfill gap** — pump test triggers from *inside* the first fetch and asserts both rows are emitted by that same run, with the second pass resuming from the backfill's last id.
6. **CR-06 unsubscribe** — hub tests prove double-call idempotence on both `subscribe` and `subscribeAll`, and that a late second unsubscribe from a torn-down stream leaves a reconnected subscriber registered and receiving.
7. **CR-07 token budget** — tests prove the floor, the >500 and capped budget at 4000 code points, monotonicity, code-point (not code-unit) counting, and that the value reaching the SDK's `max_tokens` is exactly `maxTokensFor(text)`.
8. **CR-08 notification tag** — `buildContentFreePayload` test proves the exact payload key set including `tag`; send and subscribe tests prove the tag equals the web-push topic at both call sites; file assertion proves `sw.js` reads `data.tag` and no longer references `conversationId`.

## Self-Check: PASSED

All created files verified present on disk:

- `src/server/realtime/sse-pump.ts`, `src/server/realtime/sse-pump.test.ts`, `src/server/realtime/hub.test.ts`
- `src/server/http/ip.ts`, `src/server/http/ip.test.ts`
- `src/app/api/admin/login/login.ts`, `src/app/api/admin/login/login.test.ts`

All commits verified present in `git log`: `9b42fa4`, `dd6e98e`, `d61186c`.
