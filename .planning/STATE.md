---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 01
current_phase_name: Foundation and the Realtime Spine
status: executing
stopped_at: Completed 01-01-PLAN.md
last_updated: "2026-07-20T02:30:15.041Z"
last_activity: 2026-07-20
last_activity_desc: Phase 01 execution started
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 13
  completed_plans: 1
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-20)

**Core value:** A person opens the URL and, within seconds, is in a warm conversation with a real human being in their own language — and can always be reached again when that human replies.
**Current focus:** Phase 01 — Foundation and the Realtime Spine

## Current Position

Phase: 01 (Foundation and the Realtime Spine) — EXECUTING
Plan: 2 of 13
Status: Ready to execute
Last activity: 2026-07-20 — Phase 01 execution started

Progress: [█░░░░░░░░░] 8%

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

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

- **Owner prerequisite (blocks Phase 1 spike):** An OVH Public Cloud project and API key must be created manually. The anonymous free tier is 2 req/min per IP and is unusable for the spike.
- **Open risk (Phase 1):** No OVH model documents Swahili support. If the spike fails on Swahili, the choice is to drop it from the language list or add a second provider for that language only.
- **Unrecoverable failure mode (Phase 3):** VAPID key loss permanently unreachable-ifies every existing visitor. Keys are generated once off-box and backed up — never in a Dockerfile or startup script.
- **Needs real hardware (Phase 2):** iOS push under an installed PWA is the lowest-confidence area in the research corpus and cannot be simulated.
- **Verify empirically (Phase 1 first deploy):** Traefik idle timeouts on long-lived SSE connections on the target Coolify version — silent failure mode, community-sourced only.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-20T02:30:15.030Z
Stopped at: Completed 01-01-PLAN.md
Resume file: None
