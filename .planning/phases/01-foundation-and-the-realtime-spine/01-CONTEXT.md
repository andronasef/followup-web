# Phase 1: Foundation and the Realtime Spine - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the entire message spine and settles the language list before a single locale string is written:

- The OVH translation spike (FOUND-01) and its written go/no-go on the final language list
- All seven tables, including `responders` and nullable assignment columns from day one (FOUND-03)
- One dedicated Postgres `LISTEN` connection plus a bounded pool feeding SSE, with `Last-Event-ID` backfill against `messages.id` (FOUND-02, CHAT-07)
- Server-set signed httpOnly cookie identity, mirrored to localStorage (ID-01, ID-02, ID-05)
- The localized RTL/LTR full-screen chat shell with exactly two header controls (CHAT-01, CHAT-09, LANG-01…07)
- Durable message persistence ahead of all downstream work (CHAT-03, CHAT-06)
- A minimal owner login and reply surface so the realtime path is exercised end to end, not assumed (ADMIN-01, ADMIN-03)
- Rate limiting on HMAC'd IP, no pastoral content in logs, named Postgres volume, single-container Coolify deploy with migrations at start (OPS-01, OPS-06, OPS-09, FOUND-04)

**Not this phase:** the real push gate (Phase 2 — the `<Gate>` here is a shell behind an env bypass flag), translation runtime (Phase 2), presence *toggle* (Phase 3 — presence is read-only here), the prioritized inbox, filters, search, counts, status/faith controls, block/delete, crisis resources, lockout, health check, restore drill (Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Translation spike — FOUND-01

- **D-01: If Swahili fails on the OVH models, it is dropped from the ten.** Ship nine languages. No second provider, no degraded-Swahili mode. A Swahili speaker falls back to English or French, which is common in the target regions, and nobody reads a gospel presentation the system cannot vouch for. This makes the language list a *nine-or-ten* decision, resolved by the spike, before any locale file is authored.
- **D-02: Judgment is automated — round-trip translation plus the TRANS-07 validators.** Script-block match, length ratio, refusal markers, preservation of emoji/URLs/digits. No native-speaker review gate. Fast, repeatable, and re-runnable; the go/no-go is a written owner decision backed by that evidence.
- **D-03: Pass bar is 90% clean across the corpus, applied uniformly — including the prompt-injection cases.** The user was explicitly shown the alternative (100% on injection, 90% elsewhere) and chose the single uniform bar. **Planner/researcher note:** this means the spike can pass a model that answers rather than translates roughly 1 case in 10. The accepted mitigation is TRANS-04's show-original safeguard plus the owner reading the original text. If the spike surfaces *any* injection failure, surface it explicitly in the go/no-go write-up rather than burying it in an aggregate percentage.
- **D-04: Only `Qwen3.5-397B-A17B` is tested.** It is the best-multilingual candidate; if it cannot do Swahili, nothing on the platform can, so the go/no-go arrives fastest. `Qwen3.6-27B` is left untested, which leaves the cost/latency question open for Phase 2 — note it, do not resolve it here. Model ID still comes from config, never a string literal (catalog vs. live `GET /v1/models` drift).

### Welcome and presence — CHAT-02, CHAT-05

- **D-05: The welcome is rendered client-side from the locale JSON. It is not a row in `messages`.** No insert on first visit; it re-renders instantly when the visitor switches language; `messages` stays purely human-authored, which matches the product's core promise. It is therefore never replayed by `Last-Event-ID` because there is nothing to replay.
- **D-06: Presence is shown as a quiet status line under the header, alongside a constant welcome** — not baked into the welcome text. **Note the tension for the planner:** CHAT-09 specifies exactly two header *controls*; the status line is passive text, not a control, and must be built so it cannot read as a third control or as a support-widget status dot.
- **D-07: The status line updates live over the existing SSE stream.** A presence event type on the already-open stream plus a `responders` read. It must never lie while someone sits on the page. Phase 3's owner-facing toggle consumes this same path — build the read side so the toggle is additive.
- **D-08: The welcome is two short lines** — one of warmth, one setting the expectation (here now / will read this and reply). Must fit above the fold on a phone in every script in the final list, including Arabic and Hindi. No paragraph, no "who the owner is" preamble — that is the landing-page shape the product rejects.

### First load, language, appearance — LANG-01…06, CHAT-09

- **D-09: The language picker is a bottom sheet listing endonyms** — العربية, 中文, Kiswahili — not English names. Thumb-reachable on mobile, readable by someone who cannot read English, and the pattern every messaging app already taught them.
- **D-10: Unsupported browser locale falls back to English with the language control visibly nudged on first load.** Not a silent fallback — a visitor who reads no English must be able to find the switcher. No language-family mapping table.
- **D-11: No flash of wrong theme or wrong direction. Cookie drives the server render; a small pre-paint script is the backstop.** Language and appearance ride in the same server-set cookie as the visitor ID, so `<html lang dir>` and the theme class are correct in the first byte on every return visit. The pre-paint script only corrects the rare case where the cookie is missing but localStorage is not. **Keep the two in sync** — the cookie is authoritative, matching the locked "cookie wins on conflict" rule for identity.

### Minimal owner surface — ADMIN-01, ADMIN-03

- **D-12: Three screens — login, a flat conversation list, and a thread.** No filters, no sort, no counts, no status controls, no faith flag. Enough to open any conversation and reply. Phase 3 replaces the flat list with the real prioritized inbox and keeps the thread. Do not build the first slice of ADMIN-05's sort here.
- **D-13: The owner side gets realtime too, over the same SSE stream with owner scope.** The global NOTIFY channel is already the firehose the admin side wants. This tests one streaming path from both ends and gives success criterion 3 a symmetric counterpart proving both directions.
- **D-14: The owner account is created through a one-time setup page that disables itself.** First visit to the setup route creates the owner; afterwards the route is permanently dead.
  **Hard constraint on D-14 (flagged during discussion, accepted):** an open account-creation endpoint on a single-owner pastoral product is the highest-risk item in this phase. It must be closed *by construction*, not by discipline:
  - the route returns 404 the instant a `responders` row exists — checked server-side on every request, not cached
  - it additionally requires a setup token supplied as a runtime env var
  - it is never reachable once setup has run, including after a container restart or a fresh deploy against an existing DB

### Realtime resilience — FOUND-02, CHAT-04, CHAT-07

- **D-15: The server deliberately closes each SSE stream after ~4 minutes.** *(Claude's discretion — see below.)* Never let a connection live long enough for Traefik to have an opinion about it. The browser's built-in `EventSource` reconnect fires and `Last-Event-ID` replays the gap. This converts an unpredictable, silent proxy failure into a routine code path that runs hundreds of times a day — so the replay logic is continuously exercised rather than first executed during a real outage.
- **D-16: The polling fallback endpoint ships in Phase 1 with the client switch off.** `GET /api/messages?since=<id>` is built from day one — the `Last-Event-ID` replay needs that exact query anyway, so it is nearly free. If the first Coolify deploy shows SSE is unreliable behind Traefik, the fix is a client-side flag flip, not a new code path written under ship pressure.
- **D-17: Reconnects are silent until they are genuinely stuck.** The ~4-minute recycle is normal operation and must produce no UI at all. Only after repeated consecutive failures does a small "reconnecting" line appear. Sending works over `fetch` regardless of stream state.

### Delivery and failure states — CHAT-03, CHAT-06

- **D-18: Optimistic send.** The bubble appears the instant the visitor taps, in a faint state, and settles to normal once the server confirms durable persistence. Feels like the messaging apps they already use. On failure, that specific bubble is the only thing on screen that changes.
- **D-19: Automatic retry, and the visitor's text is never lost from the screen.** The app quietly retries a few times before surfacing anything. Only after retries are exhausted does it show a failed state with a tap-to-retry. Someone who just typed something hard to say must never have to type it twice.
- **D-20: Two visible states only — `sent` and `failed`.** No "delivered", no "seen", ever. CHAT-03's single delivery state stands; the failed state exists solely so a message that genuinely could not be stored is never silently swallowed, which is what CHAT-06 demands.

### Claude's Discretion

- **D-15 (stream lifetime)** — the user answered "do the best". I chose the deliberate ~4-minute server-side recycle over hold-open-with-heartbeat. Rationale: recovery code that runs constantly is recovery code that works; the alternative only ever executes when something has already gone wrong. If research surfaces a concrete reason the recycle is worse on the target Coolify/Traefik version, the planner may revisit — but the default is proactive recycle.
- **Rate-limit feel (OPS-01)** was offered and not selected. Numbers and the limited-state copy fall to researcher/planner discretion, with one binding constraint from the product: someone in crisis typing fast must not be stonewalled. The limit exists to stop floods, not to police urgency — prefer a generous burst allowance with a gentle, localized message over a hard cutoff.
- Schema shape, migration layout, SSE payload format, and the internals of the `responders`/assignment columns are all planner territory — no user preference was expressed and none is needed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source of truth for what is being built
- `PRD-chat-site.md` — v4.0, the origin document. F1–F23 functional requirements; §12 open questions were resolved at initialization. Untracked in git at repo root; do not assume it is committed.
- `.planning/PROJECT.md` — Core value, the 10-language list, translation-provider research findings (verified 2026-07-20), the full Key Decisions table, and the Out of Scope list.
- `.planning/REQUIREMENTS.md` — all 71 v1 requirements with IDs; the Phase 1 set is the 28 listed in `<domain>`. Also carries the v2-deferred list and the mapping notes explaining why ADMIN-01/03, LANG-05, OPS-07, OPS-08 and FOUND-04 land where they do.
- `.planning/ROADMAP.md` §"Phase 1" — goal, the six success criteria this phase is verified against, and the scope notes (Gate-as-shell, presence read-only, backup job wired but OPS-07 not closed, gate funnel stubbed).

### Stack, architecture, and known traps
- `.claude/CLAUDE.md` — **the locked technology stack.** Exact pinned versions, the `typescript@6.0.3` pin and why TS 7 breaks Next 16.2, the postgres.js-over-`pg` decision for `LISTEN`, `output: 'standalone'` Docker specifics (`.next/static` and `public/` are not traced — copy manually; `drizzle/` must land at `/app/drizzle`), `dynamic = 'force-dynamic'` on the SSE route, `compress: false`, `X-Accel-Buffering: no`, the 8000-byte `pg_notify` payload limit and the never-send-message-bodies rule, transactional NOTIFY semantics, the one-global-channel decision, and the full What-NOT-to-Use table.
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/SUMMARY.md`

### Live-state
- `.planning/STATE.md` — carries the four open Blockers/Concerns that bear on this phase: the OVH API key owner prerequisite (blocks the spike), the Swahili risk, the Traefik long-lived-SSE unknown to be verified empirically on the first deploy, and the VAPID key handling rule.

</canonical_refs>

<code_context>
## Existing Code Insights

**Greenfield.** The repository contains `.planning/`, `.claude/`, and `PRD-chat-site.md`. There is no `package.json`, no source tree, no migrations, no Dockerfile.

### Reusable Assets
None — nothing exists to reuse.

### Established Patterns
None in code. Every pattern established in this phase becomes the precedent for Phases 2 and 3, so:
- the SSE stream built here is the same one the presence line (D-07), the owner scope (D-13), and Phase 2's push-ACK path ride on
- the `TranslationProvider` interface should exist from Phase 1 as a ~30-line seam even though only one provider is used, per the stack doc — it makes a per-language provider a config row rather than a refactor
- `responders` + nullable assignment columns exist from day one (FOUND-03) so a second responder is additive
- `GET /api/messages?since=<id>` (D-16) is the shared query behind both `Last-Event-ID` replay and the dormant polling fallback

### Integration Points
- **Coolify** — Dockerfile build pack (not Nixpacks), `Ports Exposes = 3000`, migrations at container start via `CMD ["sh","-c","node ./scripts/migrate.mjs && node server.js"]`. Build-vs-runtime env flags matter: `DATABASE_URL`, `SESSION_SECRET`, `OVH_API_KEY` and the D-14 setup token are runtime-only.
- **OVHcloud AI Endpoints** — `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`, OpenAI SDK with `baseURL`/`apiKey`. **Owner prerequisite: an OVH Public Cloud project and API key must exist before the spike can run.** The anonymous free tier is 2 req/min per IP and is unusable.
- **Postgres** — named volume (OPS-06), `log_statement=none` and parameterized writes (OPS-09).

</code_context>

<specifics>
## Specific Ideas

- The language picker lists **endonyms in their own script** — العربية, 中文, Kiswahili — never English names (D-09).
- The welcome is **two lines, not a paragraph**: warmth, then honesty about whether the owner is there right now (D-08). Explicitly *not* the "here's who I am and this is anonymous" preamble.
- Failure UX is judged against one sentence: *someone who just typed something hard to say must never have to type it twice* (D-19).
- Rate limiting is judged against one sentence: *someone in crisis typing fast must not be stonewalled.*
- The setup route (D-14) must be dead **by construction** — a 404 driven by the existence of a `responders` row, plus a token — not by remembering to remove it.

</specifics>

<deferred>
## Deferred Ideas

- **Second translation provider / per-language routing** — already v2 in REQUIREMENTS.md. D-01 explicitly declines it as the Swahili remedy; the `TranslationProvider` seam still ships in Phase 1 so it stays a config change later.
- **Testing `Qwen3.6-27B`** — D-04 tests only the largest model. The cost/latency comparison between the two Qwen candidates is left open for Phase 2, when translation actually runs in production.
- **Owner presence toggle** — Phase 3 (ADMIN-04). Phase 1 builds only the read path (D-07); the toggle rides on it.
- **Prioritized inbox, filters, search, counts, status and faith controls** — Phase 3. D-12 deliberately ships a flat list so none of this leaks early.
- **Rate-limit numbers and limited-state copy** — not discussed; left to researcher/planner within the constraint noted under Claude's Discretion.

</deferred>

---

*Phase: 1-Foundation and the Realtime Spine*
*Context gathered: 2026-07-20*
