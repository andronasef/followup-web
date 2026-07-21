---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 02
current_phase_name: Reachability and Language
status: planned
stopped_at: Phase 2 planned (8 plans, research, patterns, coverage matrix, UI-SPEC all complete and committed)
last_updated: "2026-07-21T20:08:06.000Z"
last_activity: 2026-07-21
last_activity_desc: Reconciled STATE.md with actual repo state -- Phase 2 already had a complete 8-plan set, RESEARCH.md, PATTERNS.md, and COVERAGE.md committed (bdcdf24, 8d20dc8) that gsd-tools' init.plan-phase query was not detecting; UI-SPEC.md added and approved this session. Ready for /gsd-execute-phase 2.
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 21
  completed_plans: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-20)

**Core value:** A person opens the URL and, within seconds, is in a warm conversation with a real human being in their own language — and can always be reached again when that human replies.
**Current focus:** Phase 02 — Reachability and Language (planned, 8 plans ready to execute)

## Current Position

Phase: 01 (Foundation and the Realtime Spine) — COMPLETE (13/13 plans, live deployment verified)
Phase: 02 (Reachability and Language) — PLANNED (8 plans across 4 waves, RESEARCH.md/PATTERNS.md/COVERAGE.md/UI-SPEC.md all complete and committed)
Status: Ready for `/gsd-execute-phase 2`
Last activity: 2026-07-21 — Reconciled STATE.md with actual repo state (see Session Continuity)

Progress (Phase 1): [██████████] 100%
Progress (overall, by phase count): [███░░░░░░░░] 33%

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
| Phase 01 P08 | 15min | 3 tasks | 13 files |
| Phase 01 P09 | ~20min | 3 tasks | 20 files |
| Phase 01 P10 | ~25min | 3 tasks | 7 files |
| Phase 01 P11 | ~20min | 3 tasks | 6 files |
| Phase 01 P12 | 45min | 2 tasks | 3 files |
| Phase 01 P13 | ~3h | 4 tasks | 5 files |

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
- [Phase ?]: 01-08: SSE routes hold only a hub subscription plus short-lived repo queries; a DB-backed pump re-queries repo.messages.since/sinceAll from the last emitted id on every live event so backfilled and live messages can never duplicate or gap.
- [Phase ?]: 01-08: Write routes split into a next/headers-free send.ts/reply.ts (actual behavior, directly node:test-able) plus a thin route.ts wrapper -- plain Node's ESM resolver cannot resolve next/headers outside Next's bundler.
- [Phase ?]: 01-08: admin/stream mirrors chat/stream's race-free DB-backed pump design against a new repo.messages.sinceAll(sinceId), giving the owner-scoped firehose its own Last-Event-ID backfill.
- [Phase ?]: [01-09]: usePresence.ts modeled as a useSyncExternalStore module store (setPresence/usePresence), not React context -- the mechanism that lets Plan 01-09's UI and Plan 01-10's SSE-stream owner connect later without either plan's file needing to change.
- [Phase ?]: [01-09]: Added src/lib/i18n/strings.ts (shared getStrings(lang) lookup) and a closeAriaLabel key across all 10 locale JSON files -- both missing-critical additions needed to satisfy UI-SPEC.md's no-hardcoded-string requirement across Header/LanguageSheet/Welcome/PresenceLine.
- [Phase ?]: [01-10]: composer-logic.ts extracted as a framework-free state machine so Composer.tsx's TDD tests are node:test-runnable (JSX is not type-strippable) -- same class of split as 01-08's send.ts/reply.ts, applied to JSX instead of next/headers.
- [Phase ?]: [01-10]: useChatStream.ts exposes the raw EventSource instance instead of importing usePresence.ts directly, keeping the two hook files decoupled -- Plan 01-12 wires a 'presence' listener to usePresence.setPresence.
- [Phase ?]: 01-11: repo.conversations.listWithPreview() added (LEFT JOIN LATERAL, most-recent-message-per-conversation, coalesce fallback for message-less conversations) -- required by Task 1's own action text, not in the plan's files_modified list.
- [Phase ?]: 01-11: Message['sender'] (drizzle infers plain string from schema.ts's untyped text column, guarded only by a Postgres CHECK constraint) is cast to the 'visitor'|'owner' union at the SSR-fetch and SSE-parse boundaries where repo/wire rows flow into MessageBubble/ThreadMessage.
- [Phase ?]: Split page composition into page.tsx (Server Component, data fetch) + ChatShell.tsx (client boundary owning useChatStream/hooks) -- Server Components cannot call hooks, so this split (matching Plan 01-11's page.tsx/Thread.tsx precedent) was the only way to satisfy both requirements
- [Phase ?]: Added confirmedClientMsgIds prop to Composer.tsx so a visitor's own sent message hides from Composer's local optimistic-bubble list once it's visible in the SSE-confirmed transcript, preventing a permanent duplicate render
- [01-13]: Hosting platform substituted Coolify -> Dokploy (owner-directed, mid-Plan 01-13's Task 3 checkpoint). App and Dockerfile are unchanged (both are Dockerfile-build + Traefik-fronted self-hosted PaaS); only deployment-config specifics differ: Dokploy has no build/runtime env-var checkbox (vars in its Environment Variables tab reach only the running container by default, so no Build Args needed for any of the 5 runtime secrets), and it uses its own port + healthCheck-path fields instead of Coolify's "Ports Exposes". Dokploy application is named "followup".
- [01-13]: Postgres deployed as a docker-compose service (Dokploy Compose type), not Dokploy's managed database resource -- owner-directed. Required parameterizing previously-hardcoded onechat/onechat creds and removing host-port publishes on both db and app services (Traefik/Dokploy routes internally once a Domain is assigned; host-port publishes only caused a real security exposure and a real port conflict with a leftover deployment).
- [01-13]: Real domain + Let's Encrypt HTTPS required for the deployment -- the owner-session cookie's secure:true (Plan 01-07's deliberate design, not a bug) is correctly rejected by browsers over plain HTTP, and the free sslip.io domain doesn't support HTTPS at all. Confirms the cookie design was correct; the deployment needed real TLS.
- [01-13]: Message timestamps render in UTC (MessageBubble.formatTime), not local time -- local Date.getHours()/getMinutes() produced different strings during server-render (container, UTC) vs. client hydration (owner's browser, Africa/Cairo), a React hydration text mismatch (error #418) that broke reconciliation for the whole tree and looked like "SSE replies never arrive live."
- [01-13]: Realtime hub (src/server/realtime/hub.ts) subscriber registries pinned on globalThis, mirroring db/listener.ts's existing singleton pattern -- Next's standalone build gave instrumentation.ts's module graph (the LISTEN callback) and the SSE routes' module graph two separate hub instances, so publishChat/publishPresence never reached any subscriber even though DB-backed backfill and the heartbeat timer (neither touches the hub) kept working normally. This was the actual root cause of "replies never arrive live" (the timezone fix above was a real, separate bug, but not sufficient on its own).
- [02-CONTEXT]: Owner will generate the VAPID keypair themselves, off-box, before Phase 2 planning locks in env var names; private key backed up in a second physical/cloud location outside Dokploy; treated as permanent, rotated only as a break-glass response to compromise (accepting the visitor-loss cost).
- [02-CONTEXT]: **Requirements change** -- the push gate is softened from an unconditional hard block to shown-once-per-device: a visitor who declines/ignores the iOS walkthrough+permission prompt on their first attempt is let through to chat without push from their next visit onward. Owner explicitly accepted that some visitors become permanently unreachable in exchange for never permanently blocking a returning visitor. ROADMAP.md §Phase 2 success criterion 2 and PROJECT.md's "Push gate" section updated to match.
- [02-CONTEXT]: Translation stays on NVIDIA NIM (no OVH switch, no Qwen3.6-27B cost/latency spike this phase). Owner draft-preview is an inline swap (not side-by-side) and the owner CAN edit the translated text directly (not approve/reject-only) -- a real risk since the owner may not verify a target-language edit, mitigated only by the visitor's existing show-original tap-through, not a UI-level safeguard.
- [02-CONTEXT]: Gate funnel metrics (shown/prompt-reached/granted by platform) live as an all-time-totals stats row on the existing conversation-list screen, not a new admin screen. An unreachable conversation (revoked/expired push subscription) gets a quiet inline badge, purely informational -- no retry/re-notify action (that's Phase 3 status-control scope).

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

- **Resolved (was: OVH key blocker):** OVH Public Cloud key was never provisioned; owner substituted an NVIDIA NIM API key instead. NVIDIA NIM is now the active translation provider (config-driven, OVH addable later). See 01-02-SUMMARY.md.
- **Deferred risk (was: open blocker) — Swahili translation quality:** Live spike scored Swahili at 75% overall / 67% on the injection subset against a 90% bar (dropped scripture citation, one truncated response). Owner explicitly overrode the automated NO-GO and chose to ship all 10 languages anyway, accepting the risk. Verify empirically against real dev/staging before treating Swahili as production-ready. See TRANSLATION-SPIKE-GO-NO-GO.md.
- **Coverage gap:** 8 of 10 languages (all but Swahili, which is fully tested, and Arabic, partially tested) were not live-spike-tested this session due to free-tier API latency. Corpus is complete for all 10; re-run via `npm run translation-spike` at any time.
- **Unrecoverable failure mode (Phase 2):** VAPID key loss permanently unreachable-ifies every existing visitor. Owner will generate the keypair off-box and back up the private key in a second location outside Dokploy before Phase 2 execution — never in a Dockerfile or startup script. See 02-CONTEXT.md D-01…D-03.
- **Needs real hardware (Phase 2):** iOS push under an installed PWA is the lowest-confidence area in the research corpus and cannot be simulated.
- **Accepted tradeoff (Phase 2, requirements change):** the push gate now lets a visitor through to chat without push after one declined/ignored attempt, per device. Some visitors will therefore be permanently unreachable by push. Owner explicitly accepted this over an unconditional hard block. See 02-CONTEXT.md D-04/D-06.
- **Verify empirically (Phase 1 first deploy):** Traefik idle timeouts on long-lived SSE connections on the target deployment platform — silent failure mode, community-sourced only. Applies equally on Dokploy (also Traefik-fronted) as it would have on Coolify.
- **Resolved — Platform substitution (Phase 1, Plan 01-13):** Hosting moved from Coolify (CLAUDE.md's originally documented default) to Dokploy, owner-directed. Deployment is now live and fully verified. CLAUDE.md's "Hosting" constraint line still says "Coolify" — should be updated to "Dokploy" when the user next asks for CLAUDE.md changes (project-instructions files are edited only on direct request, not proactively).

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-21T20:08:06.000Z
Stopped at: Phase 2 reconciled as planned -- 8 plans, research, patterns, coverage, UI-SPEC all complete
Resume file: .planning/phases/02-reachability-and-language/02-08-PLAN.md
