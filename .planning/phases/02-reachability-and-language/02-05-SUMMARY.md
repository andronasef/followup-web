---
phase: 02-reachability-and-language
plan: 05
subsystem: translation
tags: [drizzle, postgres, openai-sdk, translation, next-after, transactions]

# Dependency graph
requires:
  - phase: 02-reachability-and-language
    provides: "02-01: message_translations unique index (message_id, target_lang), OWNER_LANG, conversations.getVisitorLangFor; 02-02: translate.ts's translate()/four TRANS-07 validators, circuit-breaker.ts's isOpen/recordFailure/recordSuccess"
provides:
  - "src/server/repo/messageTranslations.ts: race-free upsert (ON CONFLICT DO NOTHING), get(), listForMessageIds() batch lookup"
  - "src/server/translation/cache.ts: translateAndCache() -- the validated translate-and-persist layer both translation directions build on"
  - "messages.ts's since()/sinceAll() now return translation: string | null on every row via a LEFT JOIN filtered to OWNER_LANG"
  - "chat/messages/route.ts: after()-triggered async visitor->owner translation, guarded on session.lang !== OWNER_LANG"
  - "src/app/api/admin/messages/translate-preview.ts + translate-preview/route.ts: bounded, synchronous owner draft-preview endpoint"
  - "reply.ts: optional originalBody field, persisted as a message_translations(messageId, OWNER_LANG) row in the SAME transaction as the message insert"
affects: [02-06, 02-07, 02-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Superset-return LEFT JOIN on a shared repo query (messages.ts's since/sinceAll) so every existing SSE/polling/SSR consumer transparently gains a new field with zero changes to those consumer files"
    - "next/server's after() confined to the one request-scoped route.ts wrapper, never the next/headers-free send.ts/reply.ts modules -- extends the 01-08-established split to a third concern (translation) beyond the original next/headers one"
    - "A failing TRANS-07 validator is treated identically to a hard translate() failure -- same status='failed' + circuit-breaker.recordFailure() code path, never a third outcome"

key-files:
  created:
    - src/server/repo/messageTranslations.ts
    - src/server/repo/messageTranslations.test.ts
    - src/server/translation/cache.ts
    - src/server/translation/cache.test.ts
    - src/app/api/admin/messages/translate-preview.ts
    - src/app/api/admin/messages/translate-preview.test.ts
    - src/app/api/admin/messages/translate-preview/route.ts
  modified:
    - src/server/repo/messages.ts
    - src/server/repo/messages.test.ts
    - src/app/api/chat/messages/send.ts
    - src/app/api/chat/messages/send.test.ts
    - src/app/api/chat/messages/route.ts
    - src/app/api/admin/messages/reply.ts
    - src/app/api/admin/messages/reply.test.ts

key-decisions:
  - "since()/sinceAll() LEFT JOIN message_translations filtered to targetLang=OWNER_LANG regardless of message sender -- for a visitor message this is the OWNER_LANG translation the owner reads; for an owner message this is reply.ts's persisted pre-edit original (also stored under targetLang=OWNER_LANG). One field, one join, two semantics depending on sender -- Plan 02-08's UI owns interpreting which."
  - "translate-preview.ts calls translate.translate() directly, never cache.ts's translateAndCache() -- a preview has no messageId yet to key a cache row on, and a preview is never persisted until Send."
  - "send.ts's own header-comment discipline (zero next/headers-adjacent imports, so node:test can import it directly) was extended to also mean zero after()/translation vocabulary -- test-enforced via a doesNotMatch(/translat/i) assertion, which required rewording an added comment mid-task."

requirements-completed: [TRANS-01, TRANS-02, TRANS-03, TRANS-04, TRANS-05, TRANS-06, TRANS-09]

coverage:
  - id: D1
    description: "messageTranslations.ts's upsert is race-free (ON CONFLICT DO NOTHING) and TRANS-06-correct (a duplicate call for the same (messageId, targetLang) pair is a guaranteed no-op)"
    requirement: "TRANS-06"
    verification:
      - kind: unit
        ref: "src/server/repo/messageTranslations.test.ts (5 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D2
    description: "cache.ts's translateAndCache() skips same-language pairs and an open circuit breaker with no call/no row, and validates every successful translation against all four TRANS-07 checks before ever marking it ready -- a failing validator is treated identically to a hard failure"
    requirement: "TRANS-07"
    verification:
      - kind: unit
        ref: "src/server/translation/cache.test.ts (5 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D3
    description: "since()/sinceAll() transparently carry each message's OWNER_LANG translation (or null) to all three existing consumers (chat/stream, admin/stream, polling fallback) with zero changes to those consumer files"
    requirement: "TRANS-01"
    verification:
      - kind: unit
        ref: "src/server/repo/messages.test.ts#messages.since / #messages.sinceAll translation-join tests (4 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D4
    description: "the visitor->owner translation trigger is async (after()), correctly guarded on session.lang !== OWNER_LANG, and lives only in route.ts -- never send.ts"
    requirement: "TRANS-01"
    verification:
      - kind: unit
        ref: "src/app/api/chat/messages/send.test.ts#route.ts: schedules the visitor->owner translation trigger via after() / #route.ts: guards the translation trigger on session.lang !== OWNER_LANG (2 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D5
    description: "translate-preview.ts is bounded and same-language-aware -- a same-language visitor gets the draft back unchanged with zero LLM calls, and a failed/timed-out/invalid translation returns {translatedText: null, failed: true}, never a 500"
    requirement: "TRANS-03"
    verification:
      - kind: unit
        ref: "src/app/api/admin/messages/translate-preview.test.ts (5 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D6
    description: "reply.ts persists a message_translations(messageId, OWNER_LANG) row in the SAME transaction as the message insert when originalBody is present and differs from body -- never when absent or identical"
    requirement: "TRANS-02"
    verification:
      - kind: unit
        ref: "src/app/api/admin/messages/reply.test.ts#handleAdminReply: originalBody tests (3 tests, all passing)"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-07-22
status: complete
---

# Phase 2 Plan 5: Translation Pipeline Wiring (async visitor->owner, sync owner->visitor preview) Summary

**messageTranslations.ts + cache.ts's validated translate-and-persist layer, since()/sinceAll()'s OWNER_LANG join, an after()-triggered async visitor translation, and a bounded translate-preview endpoint with reply.ts's same-transaction original-capture -- both translation directions now fully wired at the data/API layer.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-22T01:34:00Z
- **Tasks:** 3 completed
- **Files modified:** 14 (7 created, 7 modified)

## Accomplishments
- `messageTranslations.ts`: race-free `ON CONFLICT DO NOTHING` upsert against Plan 02-01's unique index, `get()`, and a batch `listForMessageIds()` with an empty-input zero-query guard
- `cache.ts`: `translateAndCache()` -- skips same-language pairs (TRANS-06) and an open circuit breaker (TRANS-10) with no call/no row; validates every successful `translate()` result against all four TRANS-07 checks before ever marking it `ready`; a failing validator is treated identically to a hard failure
- `messages.ts`'s `since()`/`sinceAll()` now LEFT JOIN `message_translations` filtered to `OWNER_LANG`, returning `translation: string | null` on every row -- a pure superset change, so `chat/stream/route.ts`, `admin/stream/route.ts`, and `src/app/api/messages/route.ts` all transparently gained this field with zero code changes (all three forward whole row objects as-is)
- `send.ts`'s 200 result gains `messageBody`; `route.ts` schedules `translateAndCache()` via `after()`, guarded on `session.lang !== OWNER_LANG`, never awaited before the response -- the durability-first guarantee (T-02-14) holds since `after()` only runs once the 200 has already been constructed
- `translate-preview.ts` + `translate-preview/route.ts`: the owner's bounded, synchronous draft-preview call -- same-language visitors skip the LLM call entirely; failure/timeout/invalid-translation returns a generic `{translatedText: null, failed: true}` shape, never a 500
- `reply.ts`: an optional `originalBody` field persists as a `message_translations(messageId, OWNER_LANG)` row inside the SAME `db.transaction` as the message insert -- atomic with the send, no second round trip, no orphaned-row risk

## Task Commits

Each task was committed atomically:

1. **Task 1: messageTranslations.ts repo + cache.ts** - `7f0990d` (feat)
2. **Task 2: since/sinceAll OWNER_LANG join + visitor→owner async trigger** - `4671162` (feat)
3. **Task 3: translate-preview endpoint + reply.ts originalBody persist** - `310c36c` (feat)

**Plan metadata:** _pending_ (this commit)

_Note: all three tasks are `tdd="true"` in the plan; tests and implementation were authored together per task (test file + implementation file committed in the same task commit) rather than a strict separate RED-then-GREEN commit pair, since each task's action text is a fully-specified port/extension of already-corpus-tested logic (translate.ts's validators, the established DbExecutor/upsert patterns from ratelimit.ts and 02-01's gateFunnel.ts) rather than new-behavior discovery. Every task's tests were run and confirmed passing before that task's commit._

## Files Created/Modified
- `src/server/repo/messageTranslations.ts` - `upsert`/`get`/`listForMessageIds`
- `src/server/repo/messageTranslations.test.ts` - 5 tests
- `src/server/translation/cache.ts` - `translateAndCache()`
- `src/server/translation/cache.test.ts` - 5 tests
- `src/server/repo/messages.ts` - `since`/`sinceAll` LEFT JOIN + `MessageWithTranslation` type
- `src/server/repo/messages.test.ts` - 4 new translation-join tests
- `src/app/api/chat/messages/send.ts` - `messageBody` added to the 200 result
- `src/app/api/chat/messages/send.test.ts` - `messageBody` test + 2 route.ts source-inspection tests
- `src/app/api/chat/messages/route.ts` - `after()`-triggered async translation
- `src/app/api/admin/messages/translate-preview.ts` - new endpoint logic
- `src/app/api/admin/messages/translate-preview.test.ts` - 5 tests
- `src/app/api/admin/messages/translate-preview/route.ts` - `requireOwner()`-guarded wrapper
- `src/app/api/admin/messages/reply.ts` - `originalBody` field + same-transaction persist
- `src/app/api/admin/messages/reply.test.ts` - 3 new originalBody tests

## Decisions Made
- `since()`/`sinceAll()`'s LEFT JOIN is unconditional on sender -- the same `targetLang=OWNER_LANG` filter serves both "translation of a visitor message" and "pre-edit original of an owner message" semantics, keeping one join and one field rather than sender-conditional logic in the repo layer. Plan 02-08's UI is expected to interpret the field per-sender.
- `translate-preview.ts` intentionally does not reuse `cache.ts`'s `translateAndCache()` -- it calls `translate.translate()` directly and inlines the same four validators, since a preview has no `messageId` to key a cache row on and nothing is persisted until Send.
- `send.ts`'s existing `doesNotMatch(/translat/i)` test (from Plan 01-08/02-02-era discipline) forced an added type-union comment to avoid the substring "translat" entirely -- documented in code as a deliberate vocabulary boundary, not just an accident of grep.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A newly-added `send.ts` comment accidentally matched the file's own `doesNotMatch(/translat/i)` test**
- **Found during:** Task 2 (extending `SendVisitorMessageResult`'s 200 case with `messageBody`)
- **Issue:** The first draft of the added type-union comment used the words "translation" and (separately, in a different attempt) the literal substring `after(` to explain why `messageBody` exists -- both accidentally violated two of `send.test.ts`'s existing source-inspection assertions: `doesNotMatch(sendSource, /translat/i)` (preserving the file's zero-translation-vocabulary discipline) and this plan's own new acceptance criterion `grep -c "after(" send.ts == 0`.
- **Fix:** Reworded the comment to describe the mechanism ("kick off its own post-persist async pipeline") without naming what that pipeline is or literally spelling `after(`.
- **Files modified:** src/app/api/chat/messages/send.ts
- **Verification:** `grep -c "after(" src/app/api/chat/messages/send.ts` → 0; `node --test send.test.ts` passes including the pre-existing `doesNotMatch` assertion.
- **Committed in:** 4671162 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (comment wording, no behavior change).
**Impact on plan:** Zero -- caught by the plan's own acceptance criteria before commit, no scope creep, no behavior change.

## Issues Encountered
- `npm run build` failed on `/api/push/subscribe`'s page-data collection because `.env.local` has no `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` set locally (`vapid.ts`'s intentional fail-loud design from Plan 02-01, unrelated to this plan's files). Resolved exactly as 02-04-SUMMARY.md's own precedent: generated a throwaway dev VAPID keypair (`npx web-push generate-vapid-keys`) and exported it as session-local shell env vars (never written to `.env.local`, never committed) before re-running `npm run build`, which then succeeded with all 18 routes registered including the new `/api/admin/messages/translate-preview`.
- `npm test`'s default concurrency spuriously failed ~61 tests with `CONNECTION_ENDED` against the local Postgres's `max: 10` pool (documented, pre-existing local-environment behavior per this plan's own environment note). Re-ran the identical file set with `node --test --test-concurrency=1`: all 130 tests passed, confirming the concurrency failures were resource contention, not real regressions.

## User Setup Required

None for this plan specifically. `.env.local` still lacks real `VAPID_*` values (a pre-existing local-dev gap tracked since 02-01/02-04, unrelated to translation) -- a future contributor needs a throwaway dev VAPID keypair locally (or session-local env vars) before `npm run build` succeeds on this machine; this is documented in 02-04-SUMMARY.md and not reintroduced here.

## Next Phase Readiness
- Both translation directions are fully wired end to end at the data/API layer: visitor→owner is durably-async (`after()`-triggered, same-language-aware) and owner→visitor is a bounded synchronous preview with atomic original-capture on send.
- Plan 02-08's Thread.tsx/MessageBubble.tsx can now consume `since()`/`sinceAll()`'s extended `translation` field directly for the "see original" toggle on both sides, and `translate-preview.ts` is ready for the composer's inline-swap UX (D-09).
- No blockers specific to this plan. The pre-existing local VAPID env-var gap (build-only, not test-only) remains open and is tracked in STATE.md's Blockers/Concerns, not newly introduced here.

---
*Phase: 02-reachability-and-language*
*Completed: 2026-07-22*

## Self-Check: PASSED

All 7 created files confirmed present on disk; all 3 task commits (`7f0990d`, `4671162`, `310c36c`) confirmed present in `git log --oneline --all`.
