---
phase: 01-foundation-and-the-realtime-spine
plan: 01
subsystem: infra
tags: [nextjs, typescript, drizzle-orm, postgres, tailwindcss, shadcn, docker-compose]

# Dependency graph
requires: []
provides:
  - Pinned Next.js 16 + TypeScript 6.0.3 + Tailwind v4 + shadcn project scaffold
  - Full 7-table Drizzle schema (visitors, conversations, messages, responders, pushSubscriptions, messageTranslations, rateLimitBuckets)
  - Committed drizzle/0000_init.sql migration + scripts/migrate.mjs boot-time migrator
  - docker-compose.yml local Postgres 17 with named volume
  - GET /api/health real DB liveness probe
  - Minimal app shell (src/app/layout.tsx, src/app/page.tsx)
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10, 01-11, 01-12, 01-13]

# Tech tracking
tech-stack:
  added: [next@16.2.10, react@19.2.7, react-dom@19.2.7, typescript@6.0.3, drizzle-orm@0.45.2, drizzle-kit@0.31.10, postgres@3.4.9, jose@6.2.3, "@node-rs/argon2@2.0.2", openai@6.48.0, zod@4.4.3, tailwindcss@4.3.3, shadcn (radix base, nova preset, rtl)]
  patterns: [postgres.js migrator-at-boot (scripts/migrate.mjs), Drizzle array-callback extraConfig for partial index + check constraints, force-dynamic health route]

key-files:
  created:
    - package.json
    - tsconfig.json
    - next.config.ts
    - postcss.config.mjs
    - components.json
    - src/app/globals.css
    - src/server/db/schema.ts
    - drizzle.config.ts
    - drizzle/0000_init.sql
    - scripts/migrate.mjs
    - docker-compose.yml
    - src/app/api/health/route.ts
    - src/app/layout.tsx
    - src/app/page.tsx
    - .env.example
  modified:
    - .gitignore

key-decisions:
  - "Chose serial (not uuid) primary keys for conversations/responders — internal, owner-only IDs; only messages.id (bigserial) is ever exposed as the SSE event id / Last-Event-ID cursor."
  - "Remapped docker-compose.yml's Postgres host port to 5433 (was 5432) because an unrelated container already held 5432 on this dev machine; .env.example updated to match so the documented run command is actually correct here."
  - "shadcn preset 'nova' selected non-interactively (--preset nova) since the plan's locked init command has no default preset and the CLI requires one; Nova matches UI-SPEC.md's stated icon library (lucide-react)."

patterns-established:
  - "Migration-at-boot: scripts/migrate.mjs uses a non-pooled (max: 1) postgres.js client + drizzle-orm/postgres-js/migrator, run before server.js starts."
  - "Schema-only tables (pushSubscriptions, messageTranslations) exist from Phase 1 with no runtime writer — Phase 2 wires the writers without a migration."

requirements-completed: [FOUND-03, FOUND-04, ID-05]

coverage:
  - id: D1
    description: "No visitor-identifying column (name/email/phone/raw IP) exists anywhere in the schema; the only IP-derived data is an HMAC key string in rate_limit_buckets.key, never a persisted address column"
    requirement: "ID-05"
    verification:
      - kind: other
        ref: "drizzle/0000_init.sql — 7 CREATE TABLE statements manually reviewed; visitors has only id/lang/appearance/created_at/last_seen_at, rate_limit_buckets.key is text (HMAC string), responders.email is the single owner's login credential, not visitor PII"
        status: pass
    human_judgment: false
  - id: D2
    description: "responders table and nullable conversations.assigned_responder_id FK exist in schema + first migration, unwritten this phase"
    requirement: "FOUND-03"
    verification:
      - kind: other
        ref: "src/server/db/schema.ts (responders table, conversations.assignedResponderId) + drizzle/0000_init.sql (conversations_assigned_responder_id_responders_id_fk FK)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fresh clone reaches a working local dev server backed by real Postgres via docker compose up -d db && npm install && npm run migrate && npm run dev"
    requirement: "FOUND-04"
    verification:
      - kind: e2e
        ref: "manually executed: docker compose up -d db; node scripts/migrate.mjs (exit 0, 7 tables in information_schema.tables); npm run dev; curl localhost:3001/ returned 200 with 'One Chat' heading"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/health performs a real SELECT 1 against Postgres and returns 200 when reachable, not a hardcoded 200"
    verification:
      - kind: e2e
        ref: "curl localhost:3001/api/health returned HTTP 200 {\"status\":\"ok\"} after migration; route source contains export const dynamic = 'force-dynamic' and a postgres.js sql`select 1` call"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-20
status: complete
---

# Phase 01 Plan 01: Foundation Scaffold Summary

**Pinned Next.js 16 + TypeScript 6.0.3 + Tailwind v4 + shadcn scaffold, full 7-table Drizzle schema with FOUND-03's forward-compatible responders/assignment columns, and a real DB-backed /api/health — the Walking Skeleton proven end to end against a local Postgres 17 via docker-compose.**

## Performance

- **Duration:** ~25 min (excluding the Task 0 human-verify checkpoint pause)
- **Started:** 2026-07-20T02:04:00Z (approx, session resume)
- **Completed:** 2026-07-20T02:26:43Z
- **Tasks:** 3 (Task 0 was a pre-flight checkpoint only, no code)
- **Files modified:** 25

## Accomplishments
- Hand-authored `package.json` with every dependency pinned to the exact versions locked in `.claude/CLAUDE.md`/RESEARCH.md — `npm ls` confirms zero drift, `npx tsc --version` prints `Version 6.0.3` exactly.
- shadcn initialized with `--base radix --css-variables --rtl`, `baseColor: neutral`, `tailwind.config: ""` (Tailwind v4 has no config file); `button`, `drawer`, `input`, `label`, `textarea` added. Removed the `next/font` Geist import shadcn's init injected into `layout.tsx` and replaced `globals.css`'s font token with the UI-SPEC-locked system font stack (no webfont, no FOUT).
- Full 7-table Drizzle schema (`visitors`, `conversations`, `messages`, `responders`, `pushSubscriptions`, `messageTranslations`, `rateLimitBuckets`) generated into a single committed `drizzle/0000_init.sql` via `drizzle-kit generate` (never hand-written). `conversations` carries a partial unique index (`WHERE status <> 'closed'`) for CHAT-08 and the FOUND-03 nullable `assigned_responder_id` FK. `messages.id` is `bigserial` — the SSE event id / `Last-Event-ID` cursor for a later plan.
- `scripts/migrate.mjs` (non-pooled postgres.js client + `drizzle-orm/postgres-js/migrator`) applied the migration cleanly against a `docker-compose`-managed Postgres 17; `information_schema.tables` confirmed exactly 7 tables.
- `GET /api/health` performs a real `select 1`, returns 200/503 accordingly, `force-dynamic` confirmed in the build output (route shown as `ƒ (Dynamic)`, not prerendered).
- Full local run command exercised for real: `docker compose up -d db && npm run migrate && npm run dev`, then curled both `/` (200, renders "One Chat") and `/api/health` (200, `{"status":"ok"}`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold pinned Next.js 16 + TypeScript 6.0.3 + Tailwind v4 + shadcn project** - `c50ff66` (feat)
2. **Task 2: Full 7-table Drizzle schema + migration generation + local Postgres** - `8453177` (feat)
3. **Task 3: Health check route, minimal app shell, documented local run command** - `517e0f2` (feat)

_Task 0 was a `checkpoint:human-verify` (package-legitimacy gate) — no code, no commit. The human independently confirmed all four `[SUS]`-flagged package versions on npmjs.com before this executor run began._

## Files Created/Modified
- `package.json` - hand-pinned dependency manifest, dev/build/start/migrate scripts
- `tsconfig.json` - strict mode, `@/*` -> `./src/*` alias
- `next.config.ts` - `output: 'standalone'`, `compress: false`
- `postcss.config.mjs` - `@tailwindcss/postcss` plugin
- `components.json` - shadcn config, `baseColor: neutral`, `rtl: true`
- `src/app/globals.css` - `@theme inline`, system font stack, shadcn theme tokens
- `src/components/ui/{button,drawer,input,label,textarea}.tsx` - shadcn-generated components
- `src/lib/utils.ts` - shadcn's `cn()` helper
- `src/server/db/schema.ts` - all 7 Drizzle tables
- `drizzle.config.ts` - drizzle-kit config pointing at the schema
- `drizzle/0000_init.sql`, `drizzle/meta/*` - generated migration + snapshot state
- `scripts/migrate.mjs` - boot-time migrator
- `docker-compose.yml` - postgres:17, named volume, documented run command
- `src/app/api/health/route.ts` - real DB liveness probe
- `src/app/layout.tsx`, `src/app/page.tsx` - minimal app shell
- `.env.example` - documents DATABASE_URL/SESSION_SECRET/SETUP_TOKEN/OVH_* placeholders
- `.gitignore` - node_modules, .next, .env*, tsbuildinfo, next-env.d.ts

## Decisions Made
- Serial (not uuid) primary keys for `conversations`/`responders` — these ids are never client-exposed beyond an authenticated admin UI, so uuid's unguessability isn't buying anything; `messages.id` (the one id that becomes a public SSE cursor) is `bigserial`.
- `docker-compose.yml`'s Postgres host port moved to `5433` — port `5432` was already bound by an unrelated container (`sahalhabot-db`) on this dev machine. `.env.example` updated to match so the plan's documented one-command sequence is correct as written, not just in theory.
- shadcn `--preset nova` chosen explicitly (the CLI has no default and prompts interactively without it) — matches UI-SPEC.md's locked `lucide-react` icon library.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Host port 5432 already bound by an unrelated container**
- **Found during:** Task 2 (`docker compose up -d db`)
- **Issue:** `docker compose up -d db` failed with "port is already allocated" — an unrelated project's Postgres container (`sahalhabot-db`) already held `0.0.0.0:5432`.
- **Fix:** Remapped `docker-compose.yml`'s db service to host port `5433`; updated `.env.example`'s `DATABASE_URL` to match.
- **Files modified:** `docker-compose.yml`, `.env.example`
- **Verification:** `docker compose up -d db` succeeded; `docker compose exec db pg_isready` returned accepting connections; migration applied cleanly.
- **Committed in:** `8453177` (Task 2 commit)

**2. [Rule 1 - Bug] `layout.tsx` imported `Metadata` from the wrong module**
- **Found during:** Task 3 (`npm run build` type-check)
- **Issue:** `import type { Metadata, ReactNode } from "react"` — `Metadata` is a `next` export, not a `react` export; build failed TypeScript check.
- **Fix:** Split the import: `ReactNode` from `"react"`, `Metadata` from `"next"`.
- **Files modified:** `src/app/layout.tsx`
- **Verification:** `npm run build` compiled and type-checked successfully afterward.
- **Committed in:** `517e0f2` (Task 3 commit)

**3. [Rule 1 - Bug] shadcn init injected a `next/font` Geist import, violating the locked font decision**
- **Found during:** Task 1 (`npx shadcn init`)
- **Issue:** shadcn's Next.js template auto-adds `next/font/google`'s `Geist` to `layout.tsx` and a self-referential `--font-sans: var(--font-sans)` to `globals.css`. UI-SPEC.md explicitly locks a system font stack with "Do not add `next/font`. Do not add a display font" (privacy: no font-CDN request; no FOUT).
- **Fix:** Removed the `Geist` import/usage from `layout.tsx`; replaced the broken self-referential `--font-sans` in `globals.css`'s `:root` block with the literal system font stack from UI-SPEC.md.
- **Files modified:** `src/app/layout.tsx`, `src/app/globals.css`
- **Verification:** `npm run build` succeeds; `globals.css` contains no `next/font` reference; `--font-sans` resolves to a literal value, not a broken self-reference.
- **Committed in:** `c50ff66` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking/environment, 2 bugs)
**Impact on plan:** All three were necessary for correctness (build would otherwise fail, or the design contract would be silently violated) or for the plan's own documented run command to work on this machine. No scope creep — no functionality was added beyond what Tasks 1-3 specify.

## Issues Encountered
- `npm install` failed once with `EBUSY` on an `esbuild.exe` postinstall step (transient Windows file-lock, likely AV-related) — succeeded on immediate retry, no code change needed.
- `npx shadcn init --template next --base radix --css-variables --rtl -y` is interactive despite `-y` (it still prompts for a preset with no flag-supplied default in this CLI version) — resolved by adding `--preset nova` explicitly; not a plan defect, just a CLI-version detail not visible until run.

## User Setup Required
None - no external service configuration required. (Local dev DB is `docker-compose.yml`; production Postgres/secrets are Coolify runtime-only env vars per `.claude/CLAUDE.md`, out of scope for this walking-skeleton plan.)

## Next Phase Readiness
- The schema, migration, and dev-loop foundation this entire phase builds on is in place and verified against a real Postgres.
- `src/server/db/schema.ts` is ready to be imported by later plans' repo/query modules (visitors, conversations, messages, rate-limit).
- `docker-compose.yml` and `.env.example` give every subsequent Phase 1 plan a working local DB without further setup.
- No blockers. One environment-specific note for anyone else running this locally: if port `5433` is also taken, `docker-compose.yml`'s host port mapping will need another bump.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 15 deliverable files confirmed present on disk; all 3 task commits (`c50ff66`, `8453177`, `517e0f2`) confirmed in git history.
