---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 01
current_phase_name: Foundation and the Realtime Spine
status: executing
stopped_at: Completed 01-07-PLAN.md
last_updated: "2026-07-20T14:01:52.138Z"
last_activity: 2026-07-20
last_activity_desc: Translation spike go/no-go closed — owner overrode automated Swahili NO-GO, shipping all 10 languages
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 13
  completed_plans: 7
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-20)

**Core value:** A person opens the URL and, within seconds, is in a warm conversation with a real human being in their own language — and can always be reached again when that human replies.
**Current focus:** Phase 01 — Foundation and the Realtime Spine

## Current Position

Phase: 01 (Foundation and the Realtime Spine) — EXECUTING
Plan: 8 of 13
Status: Ready to execute
Last activity: 2026-07-20 — Translation spike go/no-go closed — owner overrode automated Swahili NO-GO, shipping all 10 languages

Progress: [█████░░░░░] 54%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 25min | 3 tasks | 25 files |
| Phase 01 P02 | ~35min | 3 tasks | 7 files |
| Phase 01 P03 | 30min | 3 tasks | 14 files |
| Phase 01 P04 | 20min | 2 tasks | 4 files |
| Phase 01 P05 | 12min | 2 tasks | 17 files |
| Phase 01 P06 | 25min | 3 tasks | 5 files |
| Phase 01 P07 | 15min | 3 tasks | 9 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Translation spike runs first, inside Phase 1, before any locale file is written — Swahili is undocumented on every OVH model and the answer changes the language list.
- [Roadmap]: A minimal owner login and reply surface ships in Phase 1, not Phase 3 — without it the realtime spine cannot be exercised end to end.
- [Roadmap]: `Last-Event-ID` cursor replay is Phase 1 architecture, not Phase 3 hardening — LISTEN/NOTIFY alone cannot satisfy "no message is ever lost".
- [Roadmap]: The naive chat → push+translation → dashboard split was rejected by both the architecture and pitfalls research passes for the same two reasons.
- [Roadmap]: OPS-07 (off-box backups + restore drill) is mapped to Phase 3 because the requirement only closes when a restore is actually executed; the backup job itself is wired in Phase 1.
- [Phase ?]: Serial (not uuid) primary keys for conversations/responders — only messages.id is ever exposed as the SSE event id / Last-Event-ID cursor
- [Phase ?]: docker-compose.yml Postgres host port moved to 5433 (5432 already bound by an unrelated container on this dev machine); .env.example updated to match
- [01-02]: Translation provider substituted OVHcloud -> NVIDIA NIM (owner-directed; no OVH key available). Config-driven (`TranslationProvider` pattern), so OVH remains addable later without a rewrite.
- [01-02]: Owner explicitly overrode the automated D-01 NO-GO on Swahili (75%/67% vs 90% bar) — shipping all 10 languages, risk accepted pending real-dev verification.
- [Phase ?]: [01-03]: Repo-layer test files run via node --experimental-strip-types + node:test (no jest/vitest added); db/pool.ts and repo/*.ts use explicit .ts import extensions (tsconfig allowImportingTsExtensions) specifically so those files also resolve under plain Node, not just Next's bundler.
- [Phase ?]: [01-03]: conversations.openFor's client_msg_id/partial-unique-index concurrency safety verified empirically via Promise.all against the local Postgres, not just asserted.
- [Phase ?]: 01-04: Confirmed @node-rs/argon2 exports hash/verify (not hashAsync/verifyAsync) against installed package's index.d.ts, resolving RESEARCH.md Assumptions Log A2.
- [Phase ?]: 01-05: Language detection matches only base subtag against SUPPORTED_LANGUAGES membership, zero mapping table (D-10). formatDigits() always renders ASCII digits regardless of locale arg.
- [Phase ?]: 01-05: All 10 locale JSON files authored with an added languageName (endonym) key beyond the 17 literal Copywriting Contract rows, per plan's explicit call-out for Plan 01-09's language sheet (D-09).
- [Phase ?]: 01-06: requireVisitor({allowCookieWrite}) — RSC render never calls cookies().set() (Next.js throws); a new POST /api/visitor/bootstrap Route Handler (not in the plan's file list) is the one legal cookie-issuance path, invoked client-side on first paint by pre-paint.ts.
- [Phase ?]: 01-06: A no-cookie Server Component render performs zero DB writes — only the bootstrap Route Handler creates the visitor+conversation, avoiding orphaned rows from bots/no-JS/retry page loads.
- [Phase ?]: 01-06: 'system' appearance has no server-side resolution (Tailwind class-only dark mode, no prefers-color-scheme CSS fallback) — pre-paint.ts resolves it via matchMedia synchronously before first paint on every load.
- [Phase ?]: 01-07: Added src/server/repo/responders.ts (not in plan's files list) to keep DB access behind a repo module, matching visitors.ts/conversations.ts precedent.
- [Phase ?]: 01-07: proxy.ts guards /admin/:path* by allowing /admin/setup and /admin/login through inline (not via matcher negative-lookahead), then verifying typ==='owner' against NextRequest's own cookie jar directly -- separate from guard.ts's next/headers-based requireOwner(), since proxy.ts is nodejs-only and cannot use next/headers.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

- **Resolved (was: OVH key blocker):** OVH Public Cloud key was never provisioned; owner substituted an NVIDIA NIM API key instead. NVIDIA NIM is now the active translation provider (config-driven, OVH addable later). See 01-02-SUMMARY.md.
- **Deferred risk (was: open blocker) — Swahili translation quality:** Live spike scored Swahili at 75% overall / 67% on the injection subset against a 90% bar (dropped scripture citation, one truncated response). Owner explicitly overrode the automated NO-GO and chose to ship all 10 languages anyway, accepting the risk. Verify empirically against real dev/staging before treating Swahili as production-ready. See TRANSLATION-SPIKE-GO-NO-GO.md.
- **Coverage gap:** 8 of 10 languages (all but Swahili, which is fully tested, and Arabic, partially tested) were not live-spike-tested this session due to free-tier API latency. Corpus is complete for all 10; re-run via `npm run translation-spike` at any time.
- **Unrecoverable failure mode (Phase 3):** VAPID key loss permanently unreachable-ifies every existing visitor. Keys are generated once off-box and backed up — never in a Dockerfile or startup script.
- **Needs real hardware (Phase 2):** iOS push under an installed PWA is the lowest-confidence area in the research corpus and cannot be simulated.
- **Verify empirically (Phase 1 first deploy):** Traefik idle timeouts on long-lived SSE connections on the target Coolify version — silent failure mode, community-sourced only.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-20T14:00:33.620Z
Stopped at: Completed 01-07-PLAN.md
Resume file: None
