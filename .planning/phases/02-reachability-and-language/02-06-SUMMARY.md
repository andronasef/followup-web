---
phase: 02-reachability-and-language
plan: 06
subsystem: push
tags: [web-push, jose, zod, next-after, node-test]

# Dependency graph
requires:
  - phase: 02-reachability-and-language
    provides: "02-01's messages.markDelivered/belongsToConversation/getDeliveredAt + conversations.getVisitorLangFor; 02-04's send.ts's sendPushToVisitor/pushSubscriptions.ts's listForVisitor/deleteByEndpoint/markSuccess/markFailure; 02-05's reply.ts's originalBody persistence + since/sinceAll's OWNER_LANG join"
provides:
  - "src/app/api/chat/messages/ack.ts + ack/route.ts: handleAck -- ownership-checked, idempotent visitor ACK closing send.ts's grace-period loop"
  - "src/app/api/admin/messages/route.ts: after()-triggered sendPushToVisitor call, completing PUSH-06/08's end-to-end delivery path"
  - "reply.ts's 200 result additive fields: conversationId/visitorId/visitorLang (sourced from a new conversations.getVisitorAndLangFor lookup)"
  - "src/server/auth/visitor.ts: requireVisitor({vidParam}) -- ID-04's verified-vid-token identity reuse, additive to the existing cookie/mint-new flow"
  - "src/app/api/visitor/bootstrap/route.ts: reads an optional {vid} JSON body field, passed through as requireVisitor's vidParam"
  - "src/server/push/recover.ts (handleRecover) + src/app/api/push/recover/route.ts: ID-03's push-endpoint-keyed visitor cookie recovery"
  - "src/app/api/visitor/vid-token/route.ts: requireVisitor()-guarded GET, issues a fresh vid token for the caller's own already-identified session"
  - "pre-paint.ts: reads ?vid= from location.search, carries it through to bootstrap's JSON body"
  - "src/server/repo/pushSubscriptions.ts: getByEndpoint"
  - "src/server/repo/conversations.ts: getVisitorAndLangFor"
affects: [02-07, 02-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "next/headers-free service module + thin route.ts wrapper split (01-08 precedent), extended to ack.ts/route.ts and recover.ts/route.ts"
    - "A verified, self-issued JWT (vidParam or a push_subscriptions endpoint match) is the ONLY thing either recovery anchor ever trusts -- both fall through to the unchanged existing mint-new/no-op path on any verification failure, never inventing an identity"
    - "Source-inspection tests (readFile + regex) as the established fallback for next/headers-coupled files that cannot be imported directly by node:test -- applied to visitor.ts's requireVisitor wiring and bootstrap/route.ts's vid passthrough, paired with real DB-backed tests of the extractable primitives (verifySession/getOrCreate reuse, handleRecover)"

key-files:
  created:
    - src/app/api/chat/messages/ack.ts
    - src/app/api/chat/messages/ack.test.ts
    - src/app/api/chat/messages/ack/route.ts
    - src/server/push/recover.ts
    - src/app/api/push/recover/route.ts
    - src/app/api/visitor/vid-token/route.ts
    - src/server/auth/visitor.test.ts
  modified:
    - src/app/api/admin/messages/reply.ts
    - src/app/api/admin/messages/reply.test.ts
    - src/app/api/admin/messages/route.ts
    - src/server/repo/conversations.ts
    - src/server/auth/visitor.ts
    - src/app/api/visitor/bootstrap/route.ts
    - src/server/repo/pushSubscriptions.ts
    - src/app/pre-paint.ts

key-decisions:
  - "Added src/server/push/recover.ts (not in the plan's files_modified list) to keep the ID-03 recovery logic next/headers-free and directly node:test-able -- route.ts's own cookies() call is the only next/headers-touching part, mirroring ack.ts/route.ts's split and matching the plan's own acceptance-criteria hint ('a direct handleRecover-style unit test if the logic is factored into a testable function')."
  - "Added conversations.getVisitorAndLangFor (not explicitly named in the plan's action text, which left the exact lookup mechanism to Claude's discretion) -- one query resolving both visitorId and lang for reply.ts's push-trigger echo, and a natural side effect: an unknown conversationId now returns a clean 400 instead of surfacing as an unhandled foreign-key error from the message insert."
  - "Omitted the plan's suggested OWNER_LANG import into admin/messages/route.ts -- the plan's own action text resolves the ambiguity it raises by having handleAdminReply echo back visitorId/visitorLang directly, which is what the push trigger actually uses; importing OWNER_LANG there would have been dead code."
  - "requireVisitor()'s vidParam wiring (a next/headers-coupled file, confirmed empirically unimportable under plain node:test) is verified via source inspection plus real DB-backed tests of its extractable primitives (verifySession + getOrCreate's id-preserving reuse) and of handleRecover -- the concrete, directly-testable manifestation of the identical 'reuse an already-verified identity, never invent one' contract."

requirements-completed: [ID-03, ID-04, PUSH-06, PUSH-08]

coverage:
  - id: D1
    description: "handleAck marks a message delivered only when it belongs to the caller's own conversationId; a cross-conversation ack attempt returns 400 and leaves delivered_at null; repeated acks are idempotent"
    requirement: "PUSH-08"
    verification:
      - kind: unit
        ref: "src/app/api/chat/messages/ack.test.ts#handleAck: marks a message delivered when it belongs to the caller's own conversationId"
        status: pass
      - kind: unit
        ref: "src/app/api/chat/messages/ack.test.ts#handleAck: returns 400 without writing when messageId belongs to a DIFFERENT conversation (T-02-19)"
        status: pass
      - kind: unit
        ref: "src/app/api/chat/messages/ack.test.ts#handleAck: is idempotent -- a repeated ack for an already-delivered message stays 200"
        status: pass
    human_judgment: false
  - id: D2
    description: "admin/messages/route.ts triggers sendPushToVisitor via after(), never inside reply.ts's own transaction; reply.ts's 200 result carries conversationId/visitorId/visitorLang"
    requirement: "PUSH-06"
    verification:
      - kind: unit
        ref: "src/app/api/admin/messages/reply.test.ts#handleAdminReply: a 200 result's body includes conversationId/visitorId/visitorLang alongside id/createdAt"
        status: pass
      - kind: other
        ref: "grep -c \"after(\" src/app/api/admin/messages/route.ts >= 1 AND grep -c \"after(\" src/app/api/admin/messages/reply.ts == 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "requireVisitor({vidParam}) reuses an existing visitor identity when vidParam verifies as a signed visitor JWT, and falls through to unchanged mint-new behavior on an invalid/forged/expired token (ID-04)"
    requirement: "ID-04"
    verification:
      - kind: unit
        ref: "src/server/auth/visitor.test.ts#vidParam primitives: a verified visitor JWT's sub resolves via getOrCreate to the SAME existing visitor, never a fresh one"
        status: pass
      - kind: unit
        ref: "src/server/auth/visitor.test.ts#vidParam primitives: an invalid/forged vidParam fails verifySession and falls through to mint-new (never throws)"
        status: pass
      - kind: other
        ref: "src/server/auth/visitor.test.ts (source-inspection): requireVisitor.vidParam wiring + getOrCreate(existingVisitorId, ...) call"
        status: pass
      - kind: e2e
        ref: "live scripted check (npm run build + npm run start): POST /api/visitor/bootstrap with a fresh cookie jar and a real vid-token resolved to the SAME originating visitorId, not a freshly-minted uuid"
        status: pass
    human_judgment: false
  - id: D4
    description: "POST /api/push/recover re-signs and sets the visitor cookie for an existing push_subscriptions row's visitorId; an unknown endpoint returns 404 with no cookie (ID-03)"
    requirement: "ID-03"
    verification:
      - kind: unit
        ref: "src/server/auth/visitor.test.ts#handleRecover: a seeded push_subscriptions row resolves 200 + a cookie value that decodes to that row's visitorId"
        status: pass
      - kind: unit
        ref: "src/server/auth/visitor.test.ts#handleRecover: an endpoint matching no row returns 404 and no cookieValue (never invents an identity)"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /api/visitor/vid-token is requireVisitor()-guarded and issues a fresh vid token only for the caller's own already-identified session; pre-paint.ts carries ?vid= through to bootstrap's body"
    requirement: "ID-04"
    verification:
      - kind: other
        ref: "grep -c \"requireVisitor\" src/app/api/visitor/vid-token/route.ts >= 1; grep -c \"location.search\" src/app/pre-paint.ts >= 1"
        status: pass
      - kind: e2e
        ref: "live scripted check: GET /api/visitor/vid-token against a real cookie returned a token that, fed back through bootstrap with a fresh cookie jar, resolved to the same visitor"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-07-22
status: complete
---

# Phase 2 Plan 6: ACK Endpoint, Admin Push Trigger, and Both Visitor-Identity Recovery Anchors Summary

**Wires the visitor-side ACK that closes send.ts's grace-period loop, the admin reply route's after()-triggered push send, and both ID-03/ID-04 recovery anchors (push-endpoint lookup, URL-carried vid token) -- the plan that makes "a reply reaches an offline visitor" and "an installed iOS Home Screen app resolves to the same conversation" true end-to-end.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-22T02:01:45+03:00
- **Tasks:** 3 completed
- **Files modified:** 15 (7 created, 8 modified)

## Accomplishments
- `ack.ts`'s `handleAck` -- ownership-checked (`belongsToConversation`) and idempotent (`markDelivered`'s `isNull` guard); a visitor can only ever ack their own conversation's message, closing the receiving half of `send.ts`'s PUSH-08 grace-period check
- `admin/messages/route.ts` now triggers `sendPushToVisitor` via `after()`, entirely outside `reply.ts`'s durability-critical transaction -- `reply.ts`'s 200 result was extended with `conversationId`/`visitorId`/`visitorLang` (sourced from a new `conversations.getVisitorAndLangFor` lookup) so the route needs no second query
- `requireVisitor({vidParam})` (ID-04): a verified vid token reuses an EXISTING visitor identity instead of minting a new one; an invalid/expired/forged token falls through to the unchanged mint-new path, never throwing
- `POST /api/push/recover` (ID-03, `recover.ts`'s `handleRecover` + a thin route wrapper): re-signs and sets the visitor cookie for an existing `push_subscriptions` row's visitorId, 404s on an unknown endpoint -- never invents an identity
- `GET /api/visitor/vid-token` + `pre-paint.ts`'s `?vid=` URL carry: the full ID-04 loop -- `IosWalkthrough.tsx` (Plan 02-07) will call vid-token once, embed it in the relaunch URL, and a fresh, cookie-less iOS Home Screen relaunch's first `pre-paint.ts` bootstrap call resolves to the SAME visitor, synchronously, with no race

## Task Commits

Each task was committed atomically:

1. **Task 1: ack.ts + admin push-send trigger** - `e9ce506` (feat)
2. **Task 2: ID-03 push-endpoint recovery + requireVisitor() vidParam support** - `aa52a98` (feat)
3. **Task 3: ID-04 vid-token issuance + pre-paint.ts URL carry** - `e906dce` (feat)

**Plan metadata:** _pending_ (this commit)

_No TDD tasks in this plan's frontmatter marked `tdd="true"` used a strict RED-then-GREEN split -- each task's test file and implementation were authored together and both run/confirmed passing before that task's single commit, following 02-05's own established precedent for ports/extensions of already-tested surrounding logic._

## Files Created/Modified
- `src/app/api/chat/messages/ack.ts` - `handleAck`: ownership-checked, idempotent ACK
- `src/app/api/chat/messages/ack.test.ts` - 4 tests
- `src/app/api/chat/messages/ack/route.ts` - `requireVisitor()`-guarded thin wrapper
- `src/app/api/admin/messages/reply.ts` - `conversationId`/`visitorId`/`visitorLang` in the 200 result; a nonexistent conversationId now returns 400
- `src/app/api/admin/messages/reply.test.ts` - 2 new tests
- `src/app/api/admin/messages/route.ts` - `after()`-triggered `sendPushToVisitor` call
- `src/server/repo/conversations.ts` - `getVisitorAndLangFor`
- `src/server/auth/visitor.ts` - `requireVisitor({vidParam})`
- `src/app/api/visitor/bootstrap/route.ts` - reads optional `{vid}` body field
- `src/server/push/recover.ts` - `handleRecover`
- `src/app/api/push/recover/route.ts` - thin cookie-setting wrapper
- `src/server/repo/pushSubscriptions.ts` - `getByEndpoint`
- `src/server/auth/visitor.test.ts` - 10 tests (real DB behavior + source inspection)
- `src/app/api/visitor/vid-token/route.ts` - `requireVisitor()`-guarded token issuance
- `src/app/pre-paint.ts` - reads `?vid=` from `location.search`, carries through to bootstrap's body

## Decisions Made
- `src/server/push/recover.ts` added as a new next/headers-free module (not explicitly in the plan's file list) so `handleRecover` is directly `node:test`-able, matching the plan's own acceptance-criteria hint and the codebase's established next-headers-free-module + thin-wrapper split.
- `conversations.getVisitorAndLangFor` added as the one-query resolution the plan's action text left as "reuse `getVisitorLangFor`/a small lookup" -- also fixed a latent bug where an unknown `conversationId` would have surfaced as an unhandled foreign-key error rather than a clean 400.
- Did not import `OWNER_LANG` into `admin/messages/route.ts` as the plan's action text initially suggested -- the same paragraph's own resolution (echo `visitorId`/`visitorLang` back from `handleAdminReply`) makes that import unused; omitted rather than adding dead code.
- `requireVisitor()`'s `next/headers` import makes it (and any of its direct exports) unimportable under plain `node:test` -- confirmed empirically. Its `vidParam` behavior is verified via source inspection plus two real, DB-backed test layers: the extractable primitives it's built from (`verifySession` + `getOrCreate`'s id-preserving reuse), and `handleRecover`, which proves the identical underlying contract end-to-end against the live test DB. A full live HTTP scripted check (`npm run build` + `npm run start`, `curl`) additionally confirmed the actual `bootstrap`→`vid-token`→`bootstrap` round trip resolves to the same visitor id.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A newly-added `reply.ts` comment accidentally matched the file's own `after(` == 0 acceptance-criteria grep**
- **Found during:** Task 1, verifying acceptance criteria
- **Issue:** The first draft of `AdminReplyResult`'s type-union comment explained the additive fields by naming the mechanism literally ("via `after()`"), which matched `grep -c "after(" src/app/api/admin/messages/reply.ts` as 1, violating the plan's own `== 0` region-scoping check (the same class of self-inflicted grep collision Plan 02-05 hit and fixed in `send.ts`).
- **Fix:** Reworded the comment to describe the mechanism without naming `after(` literally ("kick off its own post-persist push-send trigger").
- **Files modified:** `src/app/api/admin/messages/reply.ts`
- **Verification:** `grep -c "after(" src/app/api/admin/messages/reply.ts` → 0; full test suite still passes.
- **Committed in:** `e9ce506` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (comment wording, no behavior change).
**Impact on plan:** Zero -- caught by the plan's own acceptance criteria before commit, no scope creep, no behavior change.

## Issues Encountered
- `requireVisitor()`'s module-scope `next/headers` import is not resolvable by plain `node --experimental-strip-types` outside Next's own bundler (confirmed empirically: `Cannot find module 'next/headers'` when importing `visitor.ts` directly). This blocks any direct `node:test` execution of `requireVisitor` itself -- resolved via the source-inspection + extracted-primitive-behavior-test combination documented above in "Decisions Made", the same class of split already established for `send.ts`/`route.ts` and `reply.ts`/`route.ts` in prior plans.
- `npm test`'s default concurrency spuriously failed some unrelated tests with `CONNECTION_ENDED` against the local Postgres's `max: 10` pool (the same known, pre-existing local-environment artifact documented in this plan's own environment note). Re-ran the full glob with `node --test --test-concurrency=1`: all 146 tests passed cleanly.
- `.env.local` still lacks real `VAPID_*` values locally (pre-existing gap tracked since 02-01/02-04). A throwaway dev VAPID keypair was generated and exported as session-local shell env vars (never written to `.env.local`, never committed) for this plan's own `npm run build`/`npm run start` verification runs.

## User Setup Required

None for this plan specifically. The pre-existing local VAPID env-var gap (documented in 02-04-SUMMARY.md/02-05-SUMMARY.md) remains open and is tracked in STATE.md's Blockers/Concerns, not newly introduced here.

## Next Phase Readiness
- Plan 02-07's `Gate.tsx`/`IosWalkthrough.tsx` can now call `GET /api/visitor/vid-token` and `POST /api/push/recover` directly -- both are built, tested, and (for the vid-token→bootstrap round trip) verified live end-to-end against a running server.
- Plan 02-08's `useChatStream.ts` can call `POST /api/chat/messages/ack` the moment a live owner-sent message arrives, the exact trigger `send.ts`'s grace-period check depends on.
- No blockers. The push/identity vertical (PUSH-06, PUSH-08, ID-03, ID-04) is now fully wired end-to-end at the data/API layer; only the UI wiring (Plan 02-07/02-08) remains.

---
*Phase: 02-reachability-and-language*
*Completed: 2026-07-22*

## Self-Check: PASSED

All 15 created/modified files confirmed present on disk; all 3 task commits (e9ce506, aa52a98, e906dce) confirmed in git history.
