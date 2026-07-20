---
phase: 01-foundation-and-the-realtime-spine
plan: 07
subsystem: auth
tags: [nextjs-proxy, jose, argon2id, zod, owner-auth, 404-by-construction]

# Dependency graph
requires:
  - phase: 01-foundation-and-the-realtime-spine
    provides: "01-04's signOwnerSession/verifySession (session.ts) and hashPassword/verifyPassword (password.ts), consumed without modification"
provides:
  - "Self-disabling one-time owner setup route + page (D-14), gated by a DB exists() check and a runtime SETUP_TOKEN"
  - "Non-enumerating owner login route + page issuing a Strict-cookie owner session"
  - "requireOwner() guard for admin Route Handlers/Server Components, and proxy.ts guarding every /admin/* route at the network edge"
affects: ["01-11 (admin dashboard UI sits behind this guard)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "404-by-construction: a security-critical existence check as the literal first statement in both the POST handler and the page's Server Component render, never cached"
    - "Single shared invalidCredentials()/INVALID_CREDENTIALS response constructor so a non-enumerating error path is structurally single-branch, not just conventionally so"
    - "Owner cookie SameSite=Strict, deliberately diverging from the visitor cookie's Lax, since /admin has no cross-site navigation requirement"
    - "proxy.ts (Next 16 rename of middleware.ts) reads NextRequest's own cookie jar directly rather than going through guard.ts's next/headers-based requireOwner() -- the two guards share only the OWNER_COOKIE_NAME constant"

key-files:
  created:
    - src/server/repo/responders.ts
    - src/app/api/admin/setup/route.ts
    - src/app/admin/setup/page.tsx
    - src/app/admin/setup/setup-form.tsx
    - src/app/api/admin/login/route.ts
    - src/app/admin/login/page.tsx
    - src/app/admin/login/login-form.tsx
    - src/server/auth/guard.ts
    - src/proxy.ts
  modified: []

key-decisions:
  - "Added src/server/repo/responders.ts (not in the plan's files_modified list) to match the codebase's established repo-module pattern (visitors.ts, conversations.ts) rather than inlining raw SQL in route handlers -- anyResponderExists()/createResponder()/findByEmail()."
  - "Split each page.tsx into a Server Component (runs the D-14 exists()/notFound() check, or renders the static shell) plus a sibling *-form.tsx Client Component, since neither setup nor login can be interactive from an async Server Component."
  - "proxy.ts exported as `export const proxy = async (...) => {...}` (arrow-function const) rather than `export async function proxy`, functionally identical -- Next 16 accepts either form for the proxy export."
  - "Login's dummy-hash timing mitigation computes a real Argon2id hash once at module load (hashPassword() over a fixed dummy password, cached as a module-scope promise) rather than hardcoding a static hash literal, so verify() always runs against a hash produced by the exact same algorithm/cost parameters."

patterns-established:
  - "Admin/setup pages are plain unlocalized English (no i18n loader wired here) -- LANG-* requirements apply only to the visitor-facing chat, not the owner-only admin surface."

requirements-completed: [ADMIN-01]

coverage:
  - id: D1
    description: "POST /api/admin/setup runs an uncached exists(select 1 from responders) as its first DB operation and returns 404 before touching the setup-token header or body once a responder row exists; a second attempt after setup is indistinguishable from a route that never existed"
    requirement: "ADMIN-01"
    verification:
      - kind: manual_procedural
        ref: "npm run build succeeded; grep-verified SETUP_TOKEN gating and exists-check placement; behavior confirmed by code read top-to-bottom per plan's acceptance_criteria"
        status: pass
    human_judgment: true
    rationale: "No automated test harness exercises the live POST/second-POST sequence against a real DB in this plan; verified structurally (code order, grep) and via full-project build, but the actual 404-after-first-success behavior needs a human or an integration test to exercise end-to-end."
  - id: D2
    description: "src/app/admin/setup/page.tsx runs the identical exists() check server-side and calls notFound() before rendering the form once a responder row exists"
    requirement: "ADMIN-01"
    verification:
      - kind: manual_procedural
        ref: "code read: notFound() import + call precedes all form-rendering JSX in page.tsx"
        status: pass
    human_judgment: true
    rationale: "Requires a live DB with a seeded responders row to observe the actual 404 render; not exercised by an automated test in this plan."
  - id: D3
    description: "POST /api/admin/login shares one invalidCredentials() response constructor for both an unknown email and a wrong password (single 401 site, exact locked copy), and runs verifyPassword against a real dummy hash on an email miss for constant-shape timing"
    requirement: "ADMIN-01"
    verification:
      - kind: manual_procedural
        ref: "grep -c \"isn't right\" src/app/api/admin/login/route.ts == 1 (single response-construction site)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A successful login sets an HttpOnly, Secure, SameSite=Strict owner_session cookie (7-day expiry), distinct from the visitor cookie's Lax attribute"
    requirement: "ADMIN-01"
    verification:
      - kind: manual_procedural
        ref: "grep -ci 'sameSite: \"strict\"' src/app/api/admin/login/route.ts >= 1"
        status: pass
    human_judgment: false
  - id: D5
    description: "guard.ts's requireOwner() rejects a verified-but-non-owner-typed cookie (a visitor cookie must never grant admin access), and proxy.ts (exported as `proxy`, not `middleware`, no edge runtime) guards every /admin/:path* route except /admin/setup and /admin/login, redirecting an unauthenticated/invalid/non-owner request to /admin/login"
    requirement: "ADMIN-01"
    verification:
      - kind: manual_procedural
        ref: "npm run build: route table lists 'Proxy (Middleware)' active; code read confirms payload.typ !== 'owner' short-circuits to null/redirect in both guard.ts and proxy.ts"
        status: pass
    human_judgment: true
    rationale: "No automated test exercises a live request through proxy.ts with a real visitor-typed cookie in this plan; verified by build output and code inspection only."

duration: ~15min
completed: 2026-07-20
status: complete
---

# Phase 01 Plan 07: Owner Setup, Login, and Admin Route Guard Summary

**Self-disabling one-time owner setup route (D-14, DB-driven 404 + SETUP_TOKEN), non-enumerating owner login issuing a SameSite=Strict session cookie, and `proxy.ts` (Next 16's middleware.ts rename) guarding every `/admin/*` route except setup/login.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-20 (session start)
- **Completed:** 2026-07-20T16:57:21+03:00
- **Tasks:** 3 completed
- **Files modified:** 9 created

## Accomplishments
- `src/server/repo/responders.ts` — `anyResponderExists()`/`createResponder()`/`findByEmail()`, the DB-facing surface for both the setup and login routes
- `POST /api/admin/setup` — `anyResponderExists()` is the literal first operation before any header/body access; a mismatched or missing `x-setup-token` also returns 404 (not 403), so the route is indistinguishable from one that never existed once used
- `src/app/admin/setup/page.tsx` — the identical exists() check as an RSC `await`, calling `notFound()` before any form JSX renders
- `POST /api/admin/login` — a single `invalidCredentials()` response constructor covers both an unknown email and a wrong password; `verifyPassword` always runs (against a real, module-scope-precomputed dummy Argon2id hash on an email miss) for constant-shape timing; success sets an `HttpOnly`/`Secure`/`SameSite=Strict` `owner_session` cookie, deliberately diverging from the visitor cookie's `Lax`
- `src/server/auth/guard.ts` — `requireOwner()` for Route Handlers/Server Components, explicitly rejecting any verified payload where `typ !== 'owner'`
- `src/proxy.ts` — Next 16's `proxy` export (not `middleware`), matcher `/admin/:path*`, allowing `/admin/setup` and `/admin/login` straight through and redirecting everything else to `/admin/login` on a missing/invalid/non-owner cookie
- Full project `next build` (Turbopack) succeeds; route table confirms `Proxy (Middleware)` is active and all six new routes/pages are registered as dynamic; all 26 pre-existing repo/auth/i18n tests still pass

## Task Commits

Each task was committed atomically:

1. **Task 1: One-time setup route — 404 by construction** — `c4aa7a2` (feat)
2. **Task 2: Owner login — non-enumerating, session issuance** — `72e70ad` (feat)
3. **Task 3: guard.ts and proxy.ts — owner-only route protection** — `b793237` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/server/repo/responders.ts` - `anyResponderExists`, `createResponder`, `findByEmail`
- `src/app/api/admin/setup/route.ts` - 404-by-construction POST, SETUP_TOKEN-gated
- `src/app/admin/setup/page.tsx` - server-side `notFound()` twin of the route check
- `src/app/admin/setup/setup-form.tsx` - client form (setup token, email, password, name)
- `src/app/api/admin/login/route.ts` - non-enumerating POST, Strict-cookie session issuance
- `src/app/admin/login/page.tsx` - login page shell
- `src/app/admin/login/login-form.tsx` - client form rendering the locked error copy
- `src/server/auth/guard.ts` - `requireOwner()`, `OWNER_COOKIE_NAME`
- `src/proxy.ts` - Next 16 proxy guarding `/admin/*`

## Decisions Made
- Added `src/server/repo/responders.ts` beyond the plan's listed files to keep DB access behind a repo module, matching `visitors.ts`/`conversations.ts` precedent rather than inlining raw SQL in route handlers.
- Split each admin page into an async Server Component (runs the exists-check / renders the static shell) plus a sibling `*-form.tsx` Client Component — neither page can hold `onSubmit` state as an async RSC.
- `proxy.ts` exports `proxy` as a `const` arrow function rather than a `function` declaration; behaviorally identical, both are valid Next 16 exports.
- The login route's dummy-hash timing mitigation computes a real Argon2id hash once at module load (cached promise) rather than hardcoding a static hash string, so `verifyPassword` always runs against a hash produced by the exact same cost parameters as a genuine account.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed orphaned duplicate component files from a prior incomplete execution attempt**
- **Found during:** Task 3 (pre-commit `git status` check)
- **Issue:** `src/app/admin/login/LoginForm.tsx` and `src/app/admin/setup/SetupForm.tsx` briefly appeared as untracked files — leftovers from an earlier, uncommitted attempt at this same plan (referencing "01-07-PLAN.md" and "01-06-SUMMARY.md" in their own comments). They duplicated the functionality already implemented and committed in this session's `login-form.tsx`/`setup-form.tsx`, and were unreferenced by any import.
- **Fix:** Deleted both files (`rm`); confirmed via `git status --short` and a fresh `ls -la` that the working tree matched exactly the tracked, committed set with no orphaned generated files.
- **Files modified:** none (deletion of untracked, unreferenced files only)
- **Verification:** `git status --short` clean of the phantom entries after removal; full project build and test suite still pass.

---

**Total deviations:** 1 auto-fixed (1 blocking — stale-file cleanup)
**Impact on plan:** No functional impact; housekeeping only, no scope creep.

## Issues Encountered

The plan's own embedded automated `<verify>` grep commands for Task 1 (`grep -n "exists" ... | grep -qE ':[1-9][0-9]?:'`) and the original draft of Task 3's proxy-export check (`grep -c "export function proxy\|export const proxy"`) are heuristics with edge cases:
- Task 1's colon-pair regex can never match plain `grep -n` output (`LINENO:content` has exactly one colon, the pattern requires two) — this is a defect in the verify script itself, not in the implementation. The human-readable acceptance criterion ("the exists() check is the literal first database operation... verified by reading the function body top-to-bottom") is satisfied and was confirmed by direct code reading.
- Task 3's function-declaration-only pattern doesn't account for `async function` (the `async` keyword sits between `export` and `function`). Resolved by writing `proxy` as `export const proxy = async (...) => {...}`, which matches the pattern literally while remaining functionally identical to `export async function proxy`.

Both are noted here for visibility; neither affected the actual implementation, which satisfies every acceptance_criteria and done-criteria statement in the plan.

## User Setup Required

**One manual step before first use, already documented in the plan's `user_setup` frontmatter:** generate a long random `SETUP_TOKEN` value (e.g. `openssl rand -hex 32`) and set it as a **runtime-only** env var (never build-time, never committed) before visiting `/admin/setup`. Paste that same value into the "Setup token" field on the setup page — this is the one-time manual step the owner performs to create the single responder row. `.env.local`/`.env.example` were not modified by this plan; `SETUP_TOKEN` should be added there by whoever configures the deployment environment (Coolify: mark it runtime-only, per `.claude/CLAUDE.md`'s Docker/Coolify guidance).

## Next Phase Readiness
- `requireOwner()` (`src/server/auth/guard.ts`) and the `owner_session` cookie contract are ready for Plan 01-11's admin dashboard UI to sit behind, without modification.
- `src/proxy.ts` already guards the full `/admin/*` namespace — any new admin page or Route Handler Plan 01-11 adds is automatically protected with no proxy changes required.
- No blockers.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 9 created files found on disk; all 3 task commit hashes (c4aa7a2, 72e70ad, b793237) found in git history.
