---
phase: 01-foundation-and-the-realtime-spine
plan: 06
subsystem: auth
tags: [cookie, jose, next.js-16, rsc, i18n, rtl, route-handler]

# Dependency graph
requires:
  - phase: 01-foundation-and-the-realtime-spine (01-03)
    provides: "repo.visitors.getOrCreate, repo.conversations.openFor"
  - phase: 01-foundation-and-the-realtime-spine (01-04)
    provides: "signVisitorId/verifySession (jose HS256 session signing)"
  - phase: 01-foundation-and-the-realtime-spine (01-05)
    provides: "detectLanguage, dirFor, SUPPORTED_LANGUAGES"
provides:
  - "requireVisitor() — the visitor identity substrate every later visitor-facing route/component depends on"
  - "Cookie-driven <html lang dir class> in layout.tsx, correct from the first byte for explicit light/dark, corrected pre-paint for 'system'"
  - "POST /api/visitor/bootstrap — the one legal Route Handler that actually issues the visitor cookie (Server Components cannot call cookies().set())"
  - "PATCH /api/chat/prefs — persists a manual language/appearance override into the signed cookie"
affects: ["01-07 (owner auth, parallel identity substrate)", "01-09 (language sheet/appearance toggle calls PATCH /api/chat/prefs)", "01-10 (visitor chat shell reads requireVisitor()'s conversation)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "requireVisitor({ allowCookieWrite }) — a single function usable from both RSC and Route Handlers, parameterized so the read-only render path never attempts cookies().set() (which Next.js throws on) and never writes an orphaned visitor+conversation row on every no-cookie page render"
    - "Cookie issuance for a brand-new visitor happens exclusively inside a Route Handler (api/visitor/bootstrap), invoked client-side on first paint by a synchronous inline script (pre-paint.ts) — the render path only ever reads"
    - "'system' appearance has no server-side resolution (Tailwind here is class-only dark mode, no prefers-color-scheme CSS fallback) — pre-paint.ts resolves it via matchMedia synchronously before first paint, unconditionally"

key-files:
  created:
    - src/server/auth/visitor.ts
    - src/app/pre-paint.ts
    - src/app/api/visitor/bootstrap/route.ts
    - src/app/api/chat/prefs/route.ts
  modified:
    - src/app/layout.tsx

key-decisions:
  - "requireVisitor() takes an allowCookieWrite option (default true) instead of being one unconditional function, because Next.js's RSC/Route-Handler cookie-mutation split is a real framework constraint the plan's own Task 1 explicitly calls out — layout.tsx passes false."
  - "Added src/app/api/visitor/bootstrap/route.ts, not listed in the plan's files_modified — it is the literal 'tiny Route Handler ... invoked from the root layout on first paint' Task 1's action text calls for; without it there is no code path that ever persists a brand-new visitor's cookie."
  - "A no-cookie Server Component render performs zero DB writes (no visitor/conversation row created) — only the bootstrap Route Handler call creates them. This avoids minting an orphaned, unreachable visitor+conversation row on every page load from a client that never completes the client-side bootstrap fetch (bots, no-JS, retries)."

patterns-established:
  - "Cross-directory server imports inside src/app/api/*/route.ts use relative paths with explicit .ts extensions, matching src/server's existing internal convention."

requirements-completed: [ID-01, ID-02, CHAT-08, LANG-01, LANG-02, LANG-03, LANG-06]

coverage:
  - id: D1
    description: "A brand-new visitor with no cookie is issued a server-set, signed, HttpOnly, Secure, SameSite=Lax cookie via POST /api/visitor/bootstrap (the one legal issuance path, since RSC render cannot mutate response cookies)"
    requirement: "ID-01"
    verification:
      - kind: manual_procedural
        ref: "curl -X POST http://localhost:3000/api/visitor/bootstrap — Set-Cookie observed with Secure; HttpOnly; SameSite=lax; Path=/"
        status: pass
    human_judgment: false
  - id: D2
    description: "A returning visitor with a valid cookie is routed to their existing open conversation, never a fresh one (CHAT-08), and does not create a new visitor row"
    requirement: "CHAT-08"
    verification:
      - kind: manual_procedural
        ref: "curl with a previously-issued cookie against GET / twice — visitors/conversations row counts in Postgres stayed at 1 each across repeat requests"
        status: pass
    human_judgment: false
  - id: D3
    description: "layout.tsx renders <html lang dir class> correctly in the first byte for a returning visitor with an explicit lang/appearance"
    requirement: "LANG-03"
    verification:
      - kind: manual_procedural
        ref: "curl with an Arabic-cookie session against GET / — response body's <html> tag showed lang=\"ar\" dir=\"rtl\"; after PATCH to en/dark, lang=\"en\" dir=\"ltr\" class=\"dark\", all in the initial HTML"
        status: pass
    human_judgment: false
  - id: D4
    description: "PATCH /api/chat/prefs rejects an unsupported language with 400 and persists a valid override into the re-signed cookie, returned to the client"
    requirement: "LANG-02"
    verification:
      - kind: manual_procedural
        ref: "curl -X PATCH with lang:\"xx\" -> 400 {\"error\":\"unsupported language\"}; curl -X PATCH with lang:\"en\",appearance:\"dark\" -> 200 {\"lang\":\"en\",\"appearance\":\"dark\"} + Set-Cookie with the new claims"
        status: pass
    human_judgment: false
  - id: D5
    description: "Existing test suite (26 tests across auth/repo/i18n) still passes unmodified after this plan's changes"
    verification:
      - kind: unit
        ref: "npm run test — 26/26 pass"
        status: pass
    human_judgment: false
  - id: D6
    description: "'system' appearance resolves to the correct light/dark class before first paint with no visible flash, and localStorage mirror never invents an independently-detected value"
    verification: []
    human_judgment: true
    rationale: "Requires visual/browser verification of the pre-paint script's timing (no flash) and an actual OS-level dark-mode toggle, which this executor cannot observe headlessly — mechanically verified only that the correction is gated behind data-cookie-present and that the localStorage write path sources exclusively from server-confirmed data-visitor-* attributes."

duration: ~25min
completed: 2026-07-20
status: complete
---

# Phase 01 Plan 06: Visitor Identity Cookie and Preference Persistence Summary

**`requireVisitor()` cookie bootstrap wired into `layout.tsx`'s first-byte render, a `POST /api/visitor/bootstrap` Route Handler as the one legal cookie-issuance path (RSC can't set cookies), a pre-paint backstop + localStorage mirror script, and `PATCH /api/chat/prefs` for persisted language/appearance overrides.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-20
- **Tasks:** 3 completed
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- `src/server/auth/visitor.ts` exports `requireVisitor({ allowCookieWrite })` — reads/verifies the signed visitor cookie via `next/headers`' async `cookies()`, resolves the visitor's open conversation via `repo.conversations.openFor` (CHAT-08), and — only when called from a Route-Handler-legal context — creates a visitor row, signs a new cookie, and sets it with `HttpOnly`, `Secure`, `SameSite=Lax`, `path=/`
- `src/app/layout.tsx` calls `requireVisitor({ allowCookieWrite: false })` and renders `<html lang dir class>` from the resolved session in the very first byte, with `data-cookie-present`/`data-visitor-*` attributes for the client-side scripts to read
- `src/app/api/visitor/bootstrap/route.ts` (new, not in the plan's file list) is the actual cookie-issuing Route Handler — `cookies().set()` is illegal inside a Server Component render, so this is the real target Task 1's action text describes
- `src/app/pre-paint.ts` is a synchronous inline script embedded in `<head>`: corrects lang/dir from a localStorage mirror only when the cookie was absent (true no-op otherwise), always resolves `'system'` appearance via `matchMedia` before paint (Tailwind here is class-only dark mode, no CSS media fallback), and mirrors server-confirmed values into localStorage
- `src/app/api/chat/prefs/route.ts` validates `{ lang?, appearance? }` with zod, rejects an unsupported language with 400, and re-signs/re-sets the cookie with merged claims, returning the updated values for immediate client UI update

## Task Commits

Each task was committed atomically:

1. **Task 1: requireVisitor() and layout.tsx cookie bootstrap** - `d4522b7` (feat) — includes the new bootstrap Route Handler
2. **Task 2: localStorage mirror + pre-paint backstop script** - `58487a0` (feat)
3. **Task 3: PATCH /api/chat/prefs — persist language/appearance override** - `eab877a` (feat)

## Files Created/Modified

- `src/server/auth/visitor.ts` - `requireVisitor()`, `VISITOR_COOKIE_NAME`, `VISITOR_COOKIE_OPTIONS`
- `src/app/layout.tsx` - cookie-driven `<html lang dir class>`, calls `requireVisitor({ allowCookieWrite: false })`
- `src/app/api/visitor/bootstrap/route.ts` - `POST` — the one legal cookie-issuance Route Handler
- `src/app/pre-paint.ts` - `PRE_PAINT_SCRIPT`, the inline pre-hydration correction + mirror + theme-resolution script
- `src/app/api/chat/prefs/route.ts` - `PATCH` — validates and persists language/appearance overrides

## Decisions Made

- `requireVisitor()` takes an `allowCookieWrite` option (default `true`) rather than being one unconditional function. Next.js genuinely throws if `cookies().set()` is called during a Server Component render, and the plan's own Task 1 action text explicitly anticipated this ("Server Components must defer the actual `cookies().set()` call to a Route Handler or Server Action"). Parameterizing one function was the minimal way to honor "usable from both Server Components and Route Handlers" while respecting the constraint.
- When `allowCookieWrite: false` and no valid cookie exists, `requireVisitor()` performs **zero database writes** — it returns render-time defaults only (detected language, `appearance: 'system'`, `visitorId: null`, `conversation: null`). Only the bootstrap Route Handler (`allowCookieWrite: true`, the default) actually creates the visitor + conversation rows. This was a deliberate choice to avoid minting an orphaned, permanently-unreachable visitor+conversation row on every single no-cookie page render (bots, crawlers, JS-disabled clients, retries before the client bootstrap fetch completes) — the plan's acceptance criteria only required no-duplication on a *valid-cookie* request, but the same correctness concern (never create dead rows) clearly extends to the missing-cookie SSR path once the constraint was worked through, so this was a Rule 2 (missing critical functionality) call.
- `'system'` appearance is resolved via `window.matchMedia('(prefers-color-scheme: dark)')` in `pre-paint.ts`, unconditionally (not gated behind the cookie-absent check), because `globals.css` uses Tailwind's class-only dark-mode strategy (`@custom-variant dark (&:is(.dark *))`) with no `prefers-color-scheme` CSS media fallback — the server has no reliable way to know a returning visitor's OS preference for `'system'`, so this resolution step is unavoidable and runs before first paint (not a flash, since it's a blocking synchronous `<head>` script).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `src/app/api/visitor/bootstrap/route.ts`**
- **Found during:** Task 1
- **Issue:** The plan's `files_modified` list (`layout.tsx`, `visitor.ts`, `pre-paint.ts`, `prefs/route.ts`) does not include a cookie-issuing Route Handler, but Task 1's own action text requires one ("issuance of a brand-new cookie happens via a tiny Route Handler or Server Action invoked from the root layout on first paint") and the plan's `must_haves.truths` requires a brand-new visitor to receive a server-set cookie — impossible to satisfy from `layout.tsx` alone since RSC render cannot call `cookies().set()`.
- **Fix:** Added `src/app/api/visitor/bootstrap/route.ts`, a `POST` handler that calls `requireVisitor()` with the default `allowCookieWrite: true`. Wired up by `pre-paint.ts` (Task 2) via a fire-and-forget `fetch` on first paint whenever `data-cookie-present="0"`.
- **Files modified:** `src/app/api/visitor/bootstrap/route.ts` (new)
- **Verification:** `curl -X POST http://localhost:3000/api/visitor/bootstrap` returns a `Set-Cookie` header with `Secure; HttpOnly; SameSite=lax; Path=/`; a subsequent `GET /` with that cookie renders the correct `lang`/`dir` and does not create a second visitor/conversation row (checked directly against Postgres).
- **Committed in:** `d4522b7` (Task 1 commit)

**2. [Rule 2 - Missing Critical] No-cookie Server Component render performs zero DB writes**
- **Found during:** Task 1
- **Issue:** A literal reading of Task 1's action text ("if absent or invalid, detects language ... creates a visitor row via `repo.visitors.getOrCreate()` ... and sets it") applied unconditionally to every call site would mean every no-cookie `GET /` (bots, crawlers, JS-disabled clients, or a client whose bootstrap fetch never lands) mints a brand-new orphaned visitor + conversation row that can never be reached again, since no cookie ties it to a future request.
- **Fix:** `requireVisitor({ allowCookieWrite: false })` (the `layout.tsx` call) returns render-time defaults with no DB write when no valid cookie exists; the visitor/conversation rows are created exactly once, only inside the bootstrap Route Handler.
- **Files modified:** `src/server/auth/visitor.ts`
- **Verification:** Repeated `curl GET /` with no cookie against a running dev server, followed by a Postgres row count — confirmed no visitor rows were created by the render path itself; only the explicit `POST /api/visitor/bootstrap` call created one.
- **Committed in:** `d4522b7` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical functionality, both required to make ID-01/CHAT-08 actually correct under Next.js's real cookie-mutation constraints).
**Impact on plan:** Necessary to make the plan's own stated must_haves and acceptance criteria achievable; no scope creep beyond visitor identity/cookie plumbing.

## Issues Encountered

None beyond the deviations above (which surfaced during initial design, not after something broke).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `requireVisitor()` is ready for every later visitor-facing plan (chat shell, composer, message routes) to import without modification.
- `src/app/api/chat/prefs/route.ts`'s `PATCH` is ready for Plan 01-09's language sheet/appearance toggle to call directly.
- `layout.tsx`'s `data-visitor-*` attributes and `pre-paint.ts`'s localStorage mirror (`oneChatLang`, `oneChatAppearance`, `oneChatVisitorId`) are available for any client component needing a display/recovery hint (never for auth).
- No blockers. `src/server/auth/visitor.ts`'s `VISITOR_COOKIE_NAME`/`VISITOR_COOKIE_OPTIONS` are exported for reuse by any future route that needs to re-sign the same cookie.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-20*
