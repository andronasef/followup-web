---
phase: 01-foundation-and-the-realtime-spine
plan: 13
subsystem: infra
tags: [docker, dokploy, deployment, postgres, hydration, realtime]

# Dependency graph
requires:
  - phase: 01-foundation-and-the-realtime-spine
    provides: The full application (Plans 01-01 through 01-12) -- this plan packages and deploys it
provides:
  - Multi-stage Dockerfile (deps/builder/runner, node:24-alpine, standalone, non-root, migrate-then-start)
  - docker-compose.yml suitable for both local verification and a real Dokploy Compose deployment (parameterized Postgres creds, no host-port publishes)
  - A live, verified Dokploy deployment (external to this repository) passing health/render/send-reply/OPS-06 persistence/locale checks
  - Two genuine production bugs found and fixed: a React hydration text mismatch (timestamp timezone divergence) and a split-module realtime-hub singleton bug
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [globalThis-pinned-singleton (now applied to both the DB listener AND the realtime hub -- any future in-process module-level state in this app must follow the same pattern or risk the same split-instance bug)]

key-files:
  created:
    - Dockerfile
    - .dockerignore
  modified:
    - docker-compose.yml
    - src/components/chat/MessageBubble.tsx
    - src/server/realtime/hub.ts

key-decisions:
  - "Hosting platform substituted Coolify -> Dokploy (owner-directed, mid-deployment). App/Dockerfile unchanged; only deployment-config specifics differ (see STATE.md decisions log)."
  - "Database deployed as a docker-compose service (Dokploy Compose type) rather than Dokploy's own managed Postgres resource -- owner-directed. Required parameterizing POSTGRES_USER/PASSWORD/DB (previously hardcoded literals) and removing host-port publishes on both `db` and `app` (Traefik/Dokploy route over the internal compose network once a Domain is assigned; a host-port publish only ever caused conflicts with other deployments on the same server)."
  - "Owner picked a plain HTTP sslip.io domain first, then switched to a real domain + Let's Encrypt HTTPS once the owner-login cookie (secure:true, by design) silently failed to set over plain HTTP -- confirms the secure-cookie design decision was correct; the fix was the deployment's TLS, not relaxing the cookie."

patterns-established:
  - "Any module holding process-lifetime, in-process state that must be shared between two different parts of the app (here: the Postgres LISTEN callback and every SSE route's subscription) MUST pin that state on `globalThis`, not a bare module-level `new Map()`/`new Set()` -- Next's standalone build can give the same source file two separate module instances across different reachability graphs, silently splitting the state in two."

requirements-completed: [OPS-06, OPS-09, FOUND-04]

coverage:
  - id: D1
    description: "Multi-stage Dockerfile (deps/builder/runner), local docker build/run verified, /api/health 200 with automatic migration"
    requirement: "FOUND-04"
    verification:
      - kind: other
        ref: "Local docker compose build/run against web-db-1; curl /api/health 200; zero manual migration commands"
        status: pass
    human_judgment: false
  - id: D2
    description: "Postgres log_statement=none + live zero-pastoral-content-in-logs verification"
    requirement: "OPS-09"
    verification:
      - kind: other
        ref: "Live canary string sent through the running stack; grepped web-app-1 and web-db-1 logs; zero matches"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live Dokploy deployment: health check, direct chat render, send/reply round trip (including live SSE push, not just backfill), OPS-06 Postgres-restart persistence, and the 10-language locale list, all owner-verified against the real deployed URL"
    requirement: "OPS-06"
    verification: []
    human_judgment: true
    rationale: "Genuine owner-only verification against infrastructure this environment has no access to -- per this plan's own checkpoint design (Task 3/4), never delegable to automation."

duration: ~3h (including live Dokploy deployment troubleshooting across a platform substitution)
completed: 2026-07-21
status: complete
---

# Phase 01 Plan 13: Dockerfile Packaging + Live Dokploy Deployment Summary

**Multi-stage Dockerfile verified locally, then deployed live to Dokploy (owner-directed substitution for Coolify) as a Docker Compose stack, surfacing and fixing two real production-only bugs: a timezone-dependent React hydration crash and a split-module realtime-hub singleton that silently broke all live SSE delivery.**

## Performance

- **Duration:** ~3h total, split between the two autonomous tasks (~1h, executor-run) and live deployment troubleshooting with the owner (~2h, orchestrator-run once the executor correctly stopped at the human-action checkpoint)
- **Completed:** 2026-07-21
- **Tasks:** 4 (2 autonomous + 2 genuine owner checkpoints)
- **Files modified:** 5 (Dockerfile, .dockerignore, docker-compose.yml, MessageBubble.tsx, hub.ts)

## Accomplishments

- Multi-stage `Dockerfile` (deps → builder → runner, `node:24-alpine`, standalone output, non-root `nextjs` user) with the three CLAUDE.md-documented manual `COPY` steps the standalone trace omits (`.next/static`, `public/`, `drizzle/` + `scripts/migrate.mjs`), plus explicit `postgres`/`drizzle-orm` package copies since plain `node scripts/migrate.mjs` runs outside Next's bundler and the standalone trace doesn't include them as real `node_modules` packages.
- Local `docker compose build/run` verified end-to-end: automatic migration at container start, `/api/health` 200, zero manual migration commands.
- OPS-09 verified live: a canary pastoral-content string sent through the running stack, confirmed persisted, then confirmed absent from both `app` and `db` container logs after `log_statement=none`.
- **Real Dokploy deployment**, including an owner-directed platform substitution (Coolify → Dokploy) and a further owner-directed architecture change (Postgres as a docker-compose service, not Dokploy's managed database resource) — both required real-time config and code adjustments, not just following the original plan's Coolify-specific checklist verbatim.
- **Two genuine bugs found and fixed against the live deployment** (not caught by local `docker compose` verification, since that never involved a real hydrating browser across a timezone boundary, nor Next's actual standalone-build module graph splitting):
  1. `MessageBubble.tsx`'s `formatTime()` used local-timezone `Date.getHours()/getMinutes()`, producing different strings during server-render (container, UTC) vs. client hydration (owner's browser, Africa/Cairo) — a React hydration text mismatch (error #418) that broke reconciliation for the rest of the tree, surfacing as "replies never appear live, only after a manual reload." Fixed to `getUTCHours()/getUTCMinutes()`.
  2. `src/server/realtime/hub.ts` held its subscriber registries as plain module-level `new Map()`/`new Set()`. In the standalone build, `instrumentation.ts`'s module graph (the Postgres LISTEN callback, the only caller of `publishChat`/`publishPresence`) and the SSE route handlers' module graph (the only callers of `subscribe`/`subscribeAll`) got two separate instances of this module — so the listener published into one set of maps while every SSE connection registered on the other, silently dropping all live message/presence delivery while DB-backed backfill and the heartbeat timer (neither touches the hub) kept working normally. Fixed by pinning the maps on `globalThis`, the same singleton discipline `db/listener.ts` already used for its own connection.
- Full Task 4 owner verification passed against the real deployment: `/api/health` 200, direct chat render (two header controls, welcome message), live send/reply round trip (after the hub fix), OPS-06 Postgres-restart persistence, and all 10 locale languages present.

## Task Commits

1. **Task 1: Multi-stage Dockerfile + local build/run verification** - `afdb01c` (feat)
2. **Task 2: Postgres logging discipline (OPS-09) + live verification** - `7a03ba7` (feat)
3. **Task 3/4 support fixes (owner-directed, live-deployment troubleshooting):**
   - `f0ddfef` — parameterize Postgres creds, drop host `db` port (Dokploy Compose deploy)
   - `4bec068` — drop `app` service's host port publish (Dokploy port conflict with the prior standalone app)
   - `69e6b00` — render message timestamps in UTC (hydration mismatch)
   - `524e00d` — pin realtime hub state on `globalThis` (live events never delivered)

_Tasks 3 and 4 were `checkpoint:human-action`/`checkpoint:human-verify` (blocking-human gates) — the dispatched executor correctly stopped at Task 3 rather than fabricating owner action, per this run's established checkpoint discipline (see 01-02-SUMMARY.md's precedent). The orchestrator then walked the owner through the live deployment directly, since that is genuine owner-witnessed interaction, not a relayable claim._

## Files Created/Modified

- `Dockerfile` - multi-stage, standalone-aware, migrate-then-start
- `.dockerignore` - excludes node_modules, .next, .git, .env*
- `docker-compose.yml` - `log_statement=none`, parameterized Postgres creds, no host-port publishes on `db`/`app` (Dokploy/Traefik routes internally once a Domain is assigned)
- `src/components/chat/MessageBubble.tsx` - `formatTime()` now UTC, not local-timezone
- `src/server/realtime/hub.ts` - subscriber registries pinned on `globalThis`

## Decisions Made

- **Coolify → Dokploy substitution** (owner-directed): app/Dockerfile unchanged; Dokploy has no build/runtime env-var checkbox (its Environment Variables tab reaches only the running container by default, no Build Args needed for our 5 runtime secrets), and uses its own port + healthCheck-path fields instead of Coolify's "Ports Exposes". Full detail in STATE.md's decisions log.
- **Postgres as a docker-compose service, not Dokploy's managed database** (owner-directed): required parameterizing previously-hardcoded `onechat`/`onechat` creds and removing both services' host-port publishes — the latter both fixed a real security exposure (Postgres directly on the server's public IP) and a real deploy-blocking port conflict (the `app` service colliding with a leftover standalone deployment).
- **Real domain + Let's Encrypt HTTPS required, not the free sslip.io domain**: the owner-session cookie's `secure: true` (a deliberate security decision from Plan 01-07, not a bug) is correctly rejected by browsers over plain HTTP. sslip.io explicitly doesn't support HTTPS. This confirms the original cookie design was right; the deployment needed real TLS, not a relaxed cookie flag.
- **UTC timestamps over local-time display**: rather than attempt a client-only-render workaround (extra complexity, a moment of visibly-wrong time before a client effect corrects it) for a pastoral one-on-one chat where exact local-time display isn't a stated requirement, timestamps are rendered in UTC consistently on both server and client. Simpler, fully eliminates the hydration-mismatch class of bug, and can be revisited later behind a client-only effect if local-time display is ever requested.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hosting platform substitution: Coolify -> Dokploy**
- **Found during:** Task 3 (owner-action checkpoint)
- **Issue:** The plan's `user_setup` was written entirely in Coolify's terms (Coolify dashboard, "Ports Exposes", build/runtime env-var checkbox). The owner does not have a Coolify instance; they have Dokploy.
- **Fix:** Researched Dokploy's actual mechanics (build type = Dockerfile vs Nixpacks, its own port/healthCheck fields, its Environment Variables vs Build Args distinction) and translated every Task 3/4 instruction to Dokploy's real UI, verified against Dokploy's own documentation rather than assumed to be identical to Coolify.
- **Files modified:** none (deployment-config only, until the follow-on fixes below)
- **Verification:** Live deployment succeeded on Dokploy following the translated instructions.
- **Committed in:** N/A (infra decision, recorded in STATE.md/this SUMMARY)

**2. [Rule 3 - Blocking] Postgres deployed as a compose service, not Dokploy's managed database resource**
- **Found during:** Task 3, after the owner explicitly requested "database on Docker"
- **Issue:** `docker-compose.yml`'s `db` service had hardcoded `onechat`/`onechat` credentials and a host-port publish on both `db` (5433:5432) and `app` (3000:3000) -- fine for local-only use, unsafe/conflict-prone once this same file became the actual Dokploy Compose deployment definition.
- **Fix:** Parameterized `POSTGRES_USER`/`PASSWORD`/`DB` and `DATABASE_URL` via `${VAR:-default}` (matching the pattern already used for `SESSION_SECRET` etc.), and removed both host-port publishes -- Traefik/Dokploy reaches each service over the internal compose network once a Domain is assigned to it.
- **Files modified:** `docker-compose.yml`
- **Verification:** Deployed successfully; `app` no longer collided with the pre-existing standalone deployment's port 3000.
- **Committed in:** `f0ddfef`, `4bec068`

**3. [Rule 3 - Blocking] React hydration mismatch from timezone-dependent timestamp formatting**
- **Found during:** Task 4 (owner send/reply verification) -- surfaced as "replies never appear live, only after reload"
- **Issue:** `MessageBubble.tsx`'s `formatTime()` used `Date.getHours()/getMinutes()` (local timezone). Server-rendered HTML (container, UTC) and client hydration (owner's browser, Africa/Cairo) produced different `HH:MM` strings for the same message, throwing React error #418 and breaking reconciliation for the rest of the tree.
- **Fix:** Switched to `getUTCHours()/getUTCMinutes()` so server and client always compute the identical string.
- **Files modified:** `src/components/chat/MessageBubble.tsx`
- **Verification:** Confirmed in an incognito window that the #418 console error was gone after redeploy.
- **Committed in:** `69e6b00`

**4. [Rule 3 - Blocking] Realtime hub split into two module instances -- live delivery silently dead**
- **Found during:** Task 4, after fix #3 didn't resolve the live-delivery symptom -- diagnosed via a raw EventStream inspection showing zero frames arrive on an already-open connection when a reply is sent (ruling out a client-rendering bug and confirming the server never sent the event)
- **Issue:** `src/server/realtime/hub.ts` held its subscriber registries as bare module-level `new Map()`/`new Set()`. In the standalone build, the module graph reachable from `instrumentation.ts` (which owns the Postgres LISTEN connection, the only caller of `publishChat`/`publishPresence`) was bundled as a separate instance from the module graph reachable from the SSE route handlers (the only callers of `subscribe`/`subscribeAll`) -- so the publisher and every subscriber were operating on two different sets of maps. DB-backed Last-Event-ID backfill (a query) and the heartbeat (a timer) both kept working since neither touches the hub, which is exactly why the failure looked SSE-transport-related (pings arrived fine) rather than what it actually was.
- **Fix:** Pinned `perConversation`/`firehose` on `globalThis`, mirroring `db/listener.ts`'s existing singleton pattern for its own LISTEN connection.
- **Files modified:** `src/server/realtime/hub.ts`
- **Verification:** Owner-confirmed live: a reply sent from admin now appears on the visitor page without any reload, and the presence line updates live too.
- **Committed in:** `524e00d`

---

**Total deviations:** 4 auto-fixed (2 infra/deployment substitutions, 2 genuine code bugs surfaced only by a real production deployment)
**Impact on plan:** No scope creep -- all four were necessary to satisfy this plan's own `must_haves` (a live, owner-verified deployment with working realtime) against real infrastructure that differed from the plan's Coolify-specific assumptions. The two code bugs (hydration timezone, split hub singleton) are correctness fixes that a Coolify deployment would very likely have hit identically, since neither is Dokploy-specific -- local `docker compose` verification simply never exercised a real hydrating browser across a timezone boundary or Next's actual standalone module-graph splitting.

## Issues Encountered

- An early Dokploy misconfiguration cloned the wrong GitHub repository (`andronasef/andronasef` instead of `andronasef/followup-web`) -- a dashboard data-entry issue, not a code or plan defect, resolved by the owner correcting the Source/Git settings.
- Two consecutive weak-password attempts (`{` then `#` in `POSTGRES_PASSWORD`) broke `DATABASE_URL`'s URI parsing in different ways (an unescaped reserved character, then a URL fragment delimiter silently truncating the string) -- resolved by switching to an alphanumeric-only password, avoiding the whole class of URI-special-character bugs rather than hand-escaping.
- Postgres's `POSTGRES_PASSWORD` env var only takes effect on a data directory's first initialization -- a password changed after that first boot silently has no effect until the volume is wiped or the password is reset in-place via `ALTER USER ... WITH PASSWORD`. Resolved via the latter (the volume held no real data yet).

## User Setup Required

None further beyond what's already live: the Dokploy Compose deployment (app named "followup") is running with its own Postgres service, a real domain with Let's Encrypt HTTPS, and all 5 runtime secrets configured. See STATE.md's decisions log for the Dokploy-specific configuration translated from this plan's original Coolify-oriented `user_setup` block.

## Next Phase Readiness

- **Phase 1 (Foundation and the Realtime Spine) is fully complete** -- all 13 plans executed, verified, and now proven against a real, live, owner-verified deployment (not just local `docker compose`).
- CLAUDE.md's "Hosting" constraint line should be updated from "Coolify" to reflect the Dokploy substitution -- flagged in STATE.md, not yet edited in CLAUDE.md itself (a project-instructions file, edited only when the user asks for it directly).
- The `globalThis`-pinned-singleton pattern this plan established (hub.ts) should be treated as a standing rule for any future in-process shared state in this app -- the same class of bug could recur in Phase 2/3 modules that don't yet exist.
- Swahili translation quality remains a deferred, tracked risk (unchanged from Plan 01-02) -- still worth a real-dev/staging language-quality check before treating it as fully production-ready, independent of this plan's infrastructure work.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 6 commits (`afdb01c`, `7a03ba7`, `f0ddfef`, `4bec068`, `69e6b00`, `524e00d`) confirmed in git history on `origin/master`. Full test suite (41/41) and `next build` both verified passing after the final fix. Live deployment independently owner-verified across all of Task 4's checklist: health check, direct render, live send/reply round trip, OPS-06 restart-persistence, and the 10-language locale list.
