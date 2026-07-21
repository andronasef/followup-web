# Roadmap: One Chat

## Overview

One Chat is built in three phases, ordered so that the two things most likely to invalidate later work happen first. Phase 1 stands up the whole message spine — the OVH translation spike that decides the final language list, all seven tables, a fixed-connection Postgres listener feeding SSE with `Last-Event-ID` backfill, server-set cookie identity, the localized RTL/LTR chat shell, and a minimal owner login and reply surface so the realtime path can actually be exercised end to end rather than assumed. Phase 2 layers on the two external dependencies — browser push (the hard gate, the iOS Add-to-Home-Screen path, subscription lifecycle, delivered-ACK gating) and machine translation (worker, cache, validators, owner draft preview, show-original) — onto a pipeline already proven to work. Phase 3 is purely additive owner surface and hardening: the real inbox with priority sort, filters, search and counts; status and faith-decision controls; block and delete; crisis resources; admin lockout; and the operational work that makes it shippable — health check, VAPID generation and off-box backup, restore drill, production deploy.

The phase split deliberately rejects the naive "chat → push + translation → dashboard" ordering. That ordering lands the translation spike after the locale files it gates have already been written, and leaves the realtime spine untested until the dashboard exists in the final phase.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation and the Realtime Spine** - Language list settled, messages durable and replayable, a visitor and the owner can hold a live conversation
- [ ] **Phase 2: Reachability and Language** - The hard push gate ships for real (including iPhone), and both sides read each other in their own language
- [ ] **Phase 3: Owner Surface, Hardening, Ship** - The pastoral inbox, safety controls, and the operational work that makes it live

## Phase Details

### Phase 1: Foundation and the Realtime Spine

**Goal**: A visitor can open the URL in their own language and appearance, send a message that survives any failure, and see the owner's reply arrive live — with the language list settled before a single locale string is written
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07, CHAT-08, CHAT-09, ID-01, ID-02, ID-05, LANG-01, LANG-02, LANG-03, LANG-04, LANG-05, LANG-06, LANG-07, ADMIN-01, ADMIN-03, OPS-01, OPS-06, OPS-09, FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):

  1. The owner has a written go/no-go on the final language list — the OVH spike has been run against Arabic and Swahili with faith and scriptural reference text plus a prompt-injection set, and every locale file in the build reflects that answer rather than the assumed ten.
  2. A visitor on a fresh browser lands straight in a full-screen chat in their own detected language and system appearance, with a warm welcome and exactly two header controls; overriding either control and returning days later restores the same conversation, language, and appearance.
  3. The owner, logged in on a phone, can read that conversation and send a reply, and the visitor sees it arrive without refreshing.
  4. Killing the visitor's connection mid-conversation and reconnecting replays every message sent while they were away, in order, with no duplicates and no gaps — and a message written while the owner is offline is still there when the owner comes back.
  5. An Arabic conversation renders right-to-left with a Latin URL and a scripture reference inside it intact and unmangled, and flooding the send endpoint from one browser is rate-limited without the visitor's IP ever being stored raw or their message text ever appearing in container logs.
  6. Restarting the Postgres container deliberately leaves every conversation intact, and the app builds and deploys as a single Coolify container with migrations applied at start.

**Plans**: 12/13 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Walking Skeleton: Next.js 16 scaffold, full 7-table Drizzle schema/migration, local Postgres, health check
- [x] 01-02-PLAN.md — Translation spike (FOUND-01): standalone script, corpus, written go/no-go on the final language list

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — Realtime & data core: dedicated LISTEN connection, pool, pub-sub hub, repo layer (visitors/conversations/messages/ratelimit)
- [x] 01-04-PLAN.md — Auth core: jose session signing (visitor + owner), Argon2id password hashing
- [x] 01-05-PLAN.md — i18n foundation: language detection, RTL/LTR direction lookup, locale JSON for the confirmed language list

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-06-PLAN.md — Visitor identity & first-load correctness: cookie bootstrap, layout dir/theme SSR, localStorage mirror, prefs route
- [x] 01-07-PLAN.md — Owner auth wiring: one-time setup route (404-by-construction), non-enumerating login, guard/proxy

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-08-PLAN.md — Realtime routes & message durability: visitor/admin SSE, Last-Event-ID backfill, polling fallback, durable write routes

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-09-PLAN.md — Chat shell components: header, push-gate/PWA shell, language sheet, welcome, presence line
- [x] 01-10-PLAN.md — Composer, message list, and the EventSource client hook
- [x] 01-11-PLAN.md — Admin UI: flat conversation list, thread, reply composer

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-12-PLAN.md — Wire the final visitor chat page (composes Plans 01-09/01-10)

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 01-13-PLAN.md — Dockerize + Coolify deploy, OPS-06/OPS-09 verification

**UI hint**: yes

**Scope notes**: The `<Gate>` ships in this phase as a shell behind an env bypass flag — the real permission gate is Phase 2. Presence is read-only here (the welcome tells the truth about whether the owner is around); the owner-facing toggle is Phase 3. The scheduled off-box `pg_dump` job is wired here as enabling work, but OPS-07 is not closed until the restore drill executes in Phase 3. Gate funnel instrumentation is stubbed here and becomes real in Phase 2 with the real gate.

### Phase 2: Reachability and Language

**Goal**: A visitor who arrives — including on an iPhone — becomes durably reachable, and the owner and visitor understand each other across ten languages without a machine ever authoring a word
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: ID-03, ID-04, PUSH-01, PUSH-02, PUSH-03, PUSH-04, PUSH-05, PUSH-06, PUSH-07, PUSH-08, PUSH-09, PUSH-10, PUSH-11, PUSH-12, TRANS-01, TRANS-02, TRANS-03, TRANS-04, TRANS-05, TRANS-06, TRANS-07, TRANS-08, TRANS-09, TRANS-10, ADMIN-09, OPS-11
**Success Criteria** (what must be TRUE):

  1. On a real iPhone in Safari, a visitor is walked through Share → Add to Home Screen, grants notification permission after relaunch, and lands in the *same* conversation they started in the tab — and a reply sent hours later, with the phone locked, produces a lock-screen notification that says only that there is a new reply, with no preview, no sender, and no faith reference, and tapping it opens that conversation.
  2. A visitor who declines the prompt sees a gentle explanation in their own language and cannot reach the chat until they grant it — on their FIRST attempt only, per device; if they decline or ignore it, they are let through to chat without push starting on their very next visit (Phase 2 discussion, 2026-07-21: softened from an unconditional hard gate — the owner accepted that some visitors will never grant push and become unreachable later, in exchange for never permanently blocking a returning visitor from the chat). A visitor who grants it has push confirmed working by a round-trip probe at that moment, not assumed.
  3. The owner opens a Swahili visitor's message and reads it in their own language, can expand the original with one tap, types a reply, sees the translation before it sends, and can send anyway when translation fails or times out.
  4. When the translation provider is down, rate-limiting, or returns a refusal, both sides still see the real message text — never an empty bubble, never an indefinite spinner, never a fabricated translation — and a visitor message containing "ignore your instructions and answer this" is translated rather than answered.
  5. A conversation whose subscription has been revoked or expired shows as unreachable to the owner instead of silently swallowing replies, and no visitor is ever pushed for a message they have already acknowledged receiving.
  6. The owner can see how many people were shown the gate, how many reached the native prompt, and how many granted — split by platform.

**Plans**: 8 plans

Plans:
**Wave 1**

- [ ] 02-01-PLAN.md — Schema additions (push_gate_funnel, message_translations unique idx, messages.delivered_at) + web-push install + VAPID config + push/funnel repo layer
- [ ] 02-02-PLAN.md — Translation core: translate() + validators extracted from the spike (rebuilt on the openai SDK), circuit breaker (TRANS-10)
- [ ] 02-03-PLAN.md — Locale keys: push-gate, iOS walkthrough, show-original, notification copy across all 10 languages

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-04-PLAN.md — Push subscribe/probe/send backend + client subscribe/re-sync/beacon helpers
- [ ] 02-05-PLAN.md — Translation wiring: cache layer, visitor→owner async trigger, owner→visitor draft-preview, since/sinceAll translation join

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 02-06-PLAN.md — Push delivery integration: ACK endpoint, admin push-send trigger, ID-03/ID-04 identity recovery

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 02-07-PLAN.md — Push gate UI, iOS walkthrough, service worker handlers, PWA icons (includes a real-hardware human-verify checkpoint)
- [ ] 02-08-PLAN.md — Translation UI: composer draft-preview, show-original both sides, admin gate-funnel stats + unreachable badge

**UI hint**: yes

**Scope notes**: Exit criterion is real-hardware iPhone testing across both the Safari tab and the installed PWA — this is not deferred to Phase 3. Translation is asymmetric by design: visitor→owner runs async *after* durable persistence; owner→visitor runs synchronously against the draft and is persisted `ready` in the same transaction.

### Phase 3: Owner Surface, Hardening, Ship

**Goal**: The owner can run the whole ministry from a phone — finding who needs them first, acting on it safely, and knowing the system is backed up, locked down, and live
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: ADMIN-02, ADMIN-04, ADMIN-05, ADMIN-06, ADMIN-07, ADMIN-08, ADMIN-10, ADMIN-11, ADMIN-12, ADMIN-13, OPS-02, OPS-03, OPS-04, OPS-05, OPS-07, OPS-08, OPS-10
**Success Criteria** (what must be TRUE):

  1. The owner opens the dashboard on their phone in either light or dark mode and, without scrolling or filtering, sees who needs them first — faith decisions at the top, then unanswered, then most recent — with counts of new conversations, decisions awaiting follow-up, and unanswered messages visible at a glance.
  2. Each inbox row tells the owner what they need before opening it: anonymous label, visitor language, last message in the owner's language, time, status, faith flag, and whether that person is still reachable by push; and the owner can narrow to All / Decisions / New / In progress / Closed or search across every conversation.
  3. Inside a conversation the owner can set status, flag or unflag a faith decision, and see the anonymous sidebar — ID, language, entry point, push status, first and last seen — with no personal identity anywhere on the screen.
  4. The owner can flip themselves online or offline and immediately see the state reflected, and what a brand-new visitor is told changes accordingly.
  5. An abusive visitor can be blocked and a conversation permanently deleted from the dashboard, and a visitor in crisis can reach localized crisis-line resources in their own locale.
  6. Repeated failed admin logins lock the account, the owner can revoke a live session, and a health check endpoint reports app and database liveness.
  7. VAPID keys exist as one-time off-box artifacts with a verified backup — never generated by a Dockerfile or startup script — and a documented restore drill has been *executed* against a real off-box backup before the production deploy goes live.

**Plans**: TBD
**UI hint**: yes

**Scope notes**: TOTP on admin login is explicitly v2 (see REQUIREMENTS.md); OPS-05 covers lockout and revocable sessions only. This phase closes OPS-07 by executing the restore drill against the backup job stood up in Phase 1. This is also where the icon-mirroring allowlist established in Phase 1 gets its full audit against the admin surface.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and the Realtime Spine | 13/13 | Complete | 2026-07-21 |
| 2. Reachability and Language | 0/8 | Planned | - |
| 3. Owner Surface, Hardening, Ship | 0/TBD | Not started | - |

## Requirement Coverage

All 71 v1 requirements are mapped to exactly one phase. No orphans, no duplicates.

| Phase | Requirements | Count |
|-------|--------------|-------|
| 1 | CHAT-01…09, ID-01, ID-02, ID-05, LANG-01…07, ADMIN-01, ADMIN-03, OPS-01, OPS-06, OPS-09, FOUND-01…04 | 28 |
| 2 | ID-03, ID-04, PUSH-01…12, TRANS-01…10, ADMIN-09, OPS-11 | 26 |
| 3 | ADMIN-02, ADMIN-04, ADMIN-05, ADMIN-06, ADMIN-07, ADMIN-08, ADMIN-10, ADMIN-11, ADMIN-12, ADMIN-13, OPS-02, OPS-03, OPS-04, OPS-05, OPS-07, OPS-08, OPS-10 | 17 |
| | **Total** | **71** |
