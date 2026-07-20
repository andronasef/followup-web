---
phase: 01-foundation-and-the-realtime-spine
plan: 04
subsystem: auth
tags: [jose, jwt, argon2, hs256, session-cookie, password-hashing]

# Dependency graph
requires:
  - phase: 01-foundation-and-the-realtime-spine
    provides: "01-01's SESSION_SECRET env var convention and @node-rs/argon2/jose dependency pins"
provides:
  - "signVisitorId/signOwnerSession/verifySession — one shared jose HS256 instance for both cookie types"
  - "hashPassword/verifyPassword — Argon2id password hashing at OWASP 2026 minimums"
affects: ["01-06 (visitor identity)", "01-07 (owner auth)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One shared jose secret discriminated by a typ claim ('visitor' | 'owner') instead of separate signing keys"
    - "Fail-loud at module import time when SESSION_SECRET is missing/weak, rather than at first use"

key-files:
  created:
    - src/server/auth/session.ts
    - src/server/auth/session.test.ts
    - src/server/auth/password.ts
    - src/server/auth/password.test.ts
  modified: []

key-decisions:
  - "@node-rs/argon2 exports hash/verify (not hashAsync/verifyAsync) — confirmed against the installed package's index.d.ts, resolving RESEARCH.md's [ASSUMED] flag (A2)."

patterns-established:
  - "Auth primitives module (session.ts, password.ts) has zero dependencies on db/pool.ts or other repo modules — Plans 01-06/01-07 import from here without modifying it."

requirements-completed: [ID-01, ADMIN-01]

coverage:
  - id: D1
    description: "signVisitorId/signOwnerSession/verifySession share one jose HS256 instance, discriminated by typ claim, with 10y/7d expirations respectively"
    requirement: "ID-01"
    verification:
      - kind: unit
        ref: "src/server/auth/session.test.ts#session: signVisitorId + verifySession round-trips sub and typ: 'visitor'"
        status: pass
      - kind: unit
        ref: "src/server/auth/session.test.ts#session: signOwnerSession + verifySession round-trips sub and typ: 'owner'"
        status: pass
      - kind: unit
        ref: "src/server/auth/session.test.ts#session: verifySession rejects a token signed with a different secret (tampered/forged)"
        status: pass
      - kind: unit
        ref: "src/server/auth/session.test.ts#session: typ round-trips faithfully so callers can branch on visitor vs owner"
        status: pass
    human_judgment: false
  - id: D2
    description: "hashPassword/verifyPassword via @node-rs/argon2 Argon2id at OWASP 2026 minimums (memoryCost=19456, timeCost=2, parallelism=1), zero bcrypt references"
    requirement: "ADMIN-01"
    verification:
      - kind: unit
        ref: "src/server/auth/password.test.ts#password: hashPassword returns a non-plaintext hash with no bcrypt fingerprint"
        status: pass
      - kind: unit
        ref: "src/server/auth/password.test.ts#password: verifyPassword resolves true for the correct password"
        status: pass
      - kind: unit
        ref: "src/server/auth/password.test.ts#password: verifyPassword resolves false for the wrong password"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-20
status: complete
---

# Phase 01 Plan 04: Session Signing and Password Hashing Summary

**One shared jose HS256 instance signs/verifies both the visitor-identity and owner-session cookies (discriminated only by a `typ` claim), plus Argon2id password hashing at OWASP 2026 minimums via `@node-rs/argon2` — zero bcrypt.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-20 (picked up mid-execution — see Issues Encountered)
- **Completed:** 2026-07-20
- **Tasks:** 2 completed
- **Files modified:** 4 (2 implementation + 2 test)

## Accomplishments
- `signVisitorId`/`signOwnerSession`/`verifySession` in `src/server/auth/session.ts` — one `jose` HS256 secret built once at module scope from `SESSION_SECRET`, throwing at import time if unset or under 32 chars
- Visitor cookies carry `sub`, `typ: 'visitor'`, optional `lang`/`appearance`, 10-year expiration; owner cookies carry `sub`, `typ: 'owner'`, 7-day expiration
- `hashPassword`/`verifyPassword` in `src/server/auth/password.ts` — `@node-rs/argon2` Argon2id, `memoryCost: 19456, timeCost: 2, parallelism: 1`
- 7 unit tests across both modules, all passing; no DB dependency in either module

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: jose session signing** — `d1f783f` (test), `de01845` (feat)
2. **Task 2: Argon2id password hashing** — `57a7b6e` (test), `5b6f3ba` (feat)

**Plan metadata:** (this commit)

_TDD tasks: test → feat, no refactor needed for either task._

## Files Created/Modified
- `src/server/auth/session.ts` - `signVisitorId`, `signOwnerSession`, `verifySession`
- `src/server/auth/session.test.ts` - round-trip, tamper-rejection, and typ-discrimination tests
- `src/server/auth/password.ts` - `hashPassword`, `verifyPassword`
- `src/server/auth/password.test.ts` - hash/verify round-trip and no-bcrypt-fingerprint tests

## Decisions Made
- Confirmed `@node-rs/argon2`'s exported member names are `hash`/`verify` (not `hashAsync`/`verifyAsync`) by reading the installed package's `index.d.ts` directly, resolving RESEARCH.md's Assumptions Log item A2 before finalizing `password.ts`.

## Deviations from Plan

None — plan executed exactly as written. All four `session.ts` behavior tests and all three `password.ts` behavior tests pass; `password.ts` contains zero `bcrypt`/`bcryptjs` references; `OPTS.algorithm` resolves to `Argon2id` with `memoryCost >= 19456`.

## Issues Encountered

This plan's tasks were mid-flight when this execution picked up: `session.ts`, `session.test.ts`, `password.test.ts`, and their RED/GREEN commits (`d1f783f`, `de01845`, `57a7b6e`) already existed on disk/in git history from an in-progress prior attempt at this same plan. `password.ts` existed on disk but was not yet committed. This run verified all four files against the plan's `<action>`/`<behavior>`/`<acceptance_criteria>` blocks (all matched exactly, including the `hash`/`verify` export-name resolution), ran the full test suite (7/7 passing), confirmed the deletion-safety and bcrypt-absence checks, and committed the remaining `feat(01-04)` step for `password.ts` (`5b6f3ba`) to close out the plan.

## TDD Gate Compliance

Both tasks have a `test(...)` commit followed by a `feat(...)` commit:
- Task 1: `d1f783f` (test) → `de01845` (feat)
- Task 2: `57a7b6e` (test) → `5b6f3ba` (feat)

No test passed unexpectedly during RED (both test files were authored against not-yet-existing implementation files per the prior attempt's history).

## User Setup Required

None - no external service configuration required. (`SESSION_SECRET` is already documented in `.env.example` from Plan 01-01/01-02 and present in local `.env.local`.)

## Next Phase Readiness
- `src/server/auth/session.ts` and `src/server/auth/password.ts` are ready for Plan 01-06 (visitor identity) and Plan 01-07 (owner auth) to import without modification.
- No blockers.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-20*
