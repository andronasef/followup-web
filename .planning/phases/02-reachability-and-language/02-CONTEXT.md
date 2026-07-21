# Phase 2: Reachability and Language - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers the two things that make "always reachable, in your own language" real:

- Browser push end-to-end: VAPID-signed subscriptions, the real hard-block permission gate (replacing Phase 1's `<Gate>` bypass shell), the guided iOS Add-to-Home-Screen walkthrough, subscription lifecycle (rotation, re-registration, revocation), delivered-ACK gating, and a lock-screen notification that says only "new reply" — no preview, no sender, no faith reference (PUSH-01…12, ID-03, ID-04)
- Machine translation end-to-end: the worker wired into the live message flow (not just Phase 1's disposable spike script), per-message caching, the owner's draft-preview-before-send, the visitor's tap-to-see-original, and graceful fallback when the provider is down/rate-limiting/refusing (TRANS-01…10, ADMIN-09)
- Gate funnel visibility for the owner (OPS-11): shown/prompt-reached/granted counts split by platform

**Not this phase:** the real prioritized inbox, filters, search, counts, status/faith controls, block/delete, crisis resources, admin lockout, restore drill, production hardening (all Phase 3). The owner's presence *toggle* is also Phase 3 — Phase 2 only consumes the read path Phase 1 already built.

**Requirements-change carried out of this discussion:** ROADMAP.md's Phase 2 success criterion 2 currently reads as an unconditional hard gate ("cannot reach the chat until they grant it"). This discussion softened that: a visitor sees the walkthrough/prompt once, and if they decline or ignore it, they're let through to chat without push on that device from then on. **This is a locked-requirements change** — ROADMAP.md and PROJECT.md must be updated to reflect it before/during planning, not left silently inconsistent with the old wording.

</domain>

<decisions>
## Implementation Decisions

### VAPID key lifecycle

- **D-01: The owner generates the VAPID keypair themselves, off-box** (not Claude, not during any executed plan) — `npx web-push generate-vapid-keys` run on their own machine, before Phase 2 planning locks in the exact env var names it expects.
- **D-02: The private key is backed up in a second physical/cloud location the owner controls**, independent of Dokploy — not a password manager specifically, but somewhere Dokploy's own failure can't take out too.
- **D-03: The keypair is treated as permanent, but the owner accepts rotation as a break-glass option if the private key is ever compromised** — understanding that rotation invalidates every existing visitor's subscription (per CLAUDE.md, the single unrecoverable-data event in this system). Not a normal operational path; a last resort.

### iOS install walkthrough & the push gate

- **D-04: The walkthrough is shown only when a visitor hits the push gate**, not proactively on first iPhone Safari visit — a visitor should reach the normal chat immediately; the install/permission flow only appears at the point push is actually being requested.
- **D-05: The walkthrough is an animated/GIF-style guided sequence** (not static step-by-step text), showing the exact Share → Add to Home Screen taps in order, in the visitor's own language.
- **D-06 (requirements change, see `<domain>`): The gate is shown once per device.** If the visitor declines, ignores it, or closes the tab instead of completing install+grant, they are let through to chat without push starting on their very next attempt — no repeated blocking. This softens ROADMAP.md's originally-locked hard gate; the owner explicitly chose this over keeping it unconditional, understanding the tradeoff (some visitors will never grant push and the owner accepts not being able to reach them later).

### Translation provider

- **D-07: NVIDIA NIM remains the active provider** — no switch back to OVH, no OVH key currently available/needed. The `TranslationProvider` config seam (`src/server/config/models.ts`) already supports this without a rewrite.
- **D-08: No Qwen3.6-27B cost/latency spike this phase.** Phase 1's deferred idea is declined for now — `qwen/qwen3.5-397b-a17b` already works; revisit only if latency or cost becomes a real production problem after Phase 2 ships translation into the live message flow.

### Owner draft-preview & show-original UX

- **D-09: Inline swap, not side-by-side.** The owner types in their own language; the composer swaps in the translated text (in the visitor's language) before sending, with a way to tap back to see/edit the original. Chosen over a side-by-side layout partly because the admin dashboard must work well on a phone (CLAUDE.md constraint) and side-by-side needs more screen space.
- **D-10: The owner can edit the translated text directly before sending** (not approve/reject-only). **Claude's discretion flag for the planner:** this carries a real risk the owner accepted knowingly — they may not read the target language fluently enough to verify an edit doesn't silently make the translation worse or change its meaning. No mitigation was requested beyond what already exists (the visitor can always tap to see the original text the owner actually typed, per D-12, which is the real safety net here, not the edit UI itself).
- **D-11: Owner messages still fall back to sending the untranslated original when translation fails/times out** (already locked by success criterion 4 in ROADMAP.md — reaffirmed here, not renegotiated).
- **D-12: On the visitor side, "show original" for owner messages is a small tap-to-expand link under the translated bubble** — not two stacked blocks shown by default. Matches the pattern visitors already know from WhatsApp/Telegram-style translated-message UI, and keeps the default bubble visually light.

### Push notification copy & delivery

- **D-13: Multiple unread replies while the phone is locked coalesce into one notification**, using web-push's `topic` field (already flagged as available in CLAUDE.md's stack notes) — never a stack of individual notifications for the same conversation.
- **D-14: Notification text is a single short, warm, pre-written phrase per language** ("You have a new reply" equivalent), authored once into the existing locale JSON files from Phase 1 — never machine-translated live at send time. There is no visitor-specific content in the notification (per the locked no-preview/no-sender/no-faith-reference rule), so nothing needs live translation here.

### Subscription refresh & re-registration

- **D-15: Endpoint rotation and re-registration are fully silent to the visitor, always** — checked on every app open (per CLAUDE.md's documented requirement), re-POSTed automatically. No visible indicator even if the re-POST itself fails.
- **D-16: On persistent re-registration failure, the client just keeps retrying silently in the background** on future app opens — no visitor-facing prompt, no re-running the install/gate walkthrough. Consistent with D-15: nothing about push plumbing should ever surface as visitor-facing UI beyond the one-time gate itself.

### Gate funnel metrics & revoked-subscription visibility (owner-facing, Phase 2 scope)

- **D-17: Gate funnel counts (shown / prompt-reached / granted, split by platform) live as a small stats row on the existing conversation-list screen** — no new admin screen. All-time totals only, no date-range picker; matches Phase 1's minimal 3-screen admin surface (D-12 from Phase 1's own context).
- **D-18: An "unreachable" conversation (push subscription revoked/expired) gets a small, quiet label/badge inline on its row** in the flat conversation list — not a separate filtered section (Phase 1 deliberately has no filters/sort; that's Phase 3's real inbox).
- **D-19: The unreachable label is purely informational in Phase 2** — no retry/re-notify action. Any status control on a conversation is explicitly Phase 3 scope (ADMIN-05 and friends), not pulled forward here.

### Claude's Discretion

- D-10's edit-translation risk (noted above) — no further mitigation requested; the show-original tap-through is the accepted safety net.
- Exact visual treatment of the "unreachable" badge (D-18) and the stats row's number formatting (D-17) — left to planner/researcher; no specific look was requested beyond "small and quiet."
- Exact GIF/animation content and pacing for the iOS walkthrough (D-05) — left to planner/researcher; only the *style* (animated, not static) and *trigger point* (at the gate, not proactively) were specified.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source of truth for what is being built
- `.planning/PROJECT.md` — Core value, key decisions table, out-of-scope list. **Needs updating** to reflect D-06's gate-softening change.
- `.planning/REQUIREMENTS.md` — PUSH-01…12, TRANS-01…10, ADMIN-09, OPS-11, ID-03/04 (the Phase 2 requirement set).
- `.planning/ROADMAP.md` §"Phase 2: Reachability and Language" — goal, the six success criteria. **Success criterion 2 needs updating** per D-06 (softened gate, shown-once-then-through) before/during planning.

### Stack, architecture, and known traps (unchanged from Phase 1, still binding)
- `.claude/CLAUDE.md` — VAPID generation/rotation rules, subscription lifecycle contract, `topic`/TTL/urgency push details, iOS Add-to-Home-Screen constraint, `TranslationProvider` interface pattern, translation caching-by-hash rule, `after()` for post-response translation/push work, no-message-bodies-in-logs discipline.
- `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, `.planning/research/STACK.md`, `.planning/research/FEATURES.md`, `.planning/research/SUMMARY.md`

### Phase 1 outputs this phase builds directly on
- `.planning/phases/01-foundation-and-the-realtime-spine/01-CONTEXT.md` — full Phase 1 decision log (D-01…D-20), especially D-06/D-07 (presence read path this phase's gate funnel sits alongside) and the SSE/realtime architecture PUSH-ACK gating will ride on.
- `.planning/phases/01-foundation-and-the-realtime-spine/01-02-SUMMARY.md` and `TRANSLATION-SPIKE-GO-NO-GO.md` — the translation provider substitution (OVH → NVIDIA NIM) and the accepted Swahili quality risk (still unverified in production — see Blockers/Concerns below).
- `.planning/phases/01-foundation-and-the-realtime-spine/01-13-SUMMARY.md` — the live Dokploy deployment, the Coolify→Dokploy substitution, and two real production bugs fixed (hydration timezone mismatch, split realtime-hub singleton) — the `globalThis`-pinned-singleton pattern established there is a standing rule for any new in-process shared state this phase introduces (e.g. gate-funnel counters, if held in memory rather than the DB).
- `src/server/config/models.ts` — the working `TranslationProvider` seam (D-07 keeps this as-is).
- `src/components/chat/Gate.tsx` — the Phase 1 bypass shell this phase replaces with the real gate logic (D-04/D-06).
- `public/manifest.webmanifest`, `public/sw.js` — the PWA/service-worker scaffold Phase 1 built with `push`/`notificationclick` handlers explicitly left for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/config/models.ts` — working, tested `TranslationProvider` config seam (NVIDIA NIM active); Phase 2 wires the actual translation calls through this, no new provider-selection code needed.
- `src/components/chat/Gate.tsx` — currently a pass-through shell (`NEXT_PUBLIC_PUSH_GATE_BYPASS`); Phase 2 replaces its bypassed branch with the real permission-request UI and iOS walkthrough.
- `public/sw.js` — hand-written service worker, currently only `install`/`activate`; Phase 2 adds the `push` and `notificationclick` handlers explicitly deferred here in Phase 1's header comment.
- `public/manifest.webmanifest` — PWA scaffold already in place; still references `icon-192.png`/`icon-512.png` which don't exist yet (flagged in 01-09-SUMMARY.md as a Phase 2 blocker to resolve).
- `src/lib/chat/usePresence.ts` — the `useSyncExternalStore` module-store pattern Phase 1 established for presence; the gate funnel counters / subscription state could follow the same client-side pattern if they need live updates, though funnel counts are more likely a straightforward DB-backed admin read (D-17 has no live-update requirement).

### Established Patterns
- `globalThis`-pinned singleton for any in-process shared state (established in Phase 1's `01-13-SUMMARY.md` bug fix to `src/server/realtime/hub.ts` and `src/server/db/listener.ts`) — binding for this phase if any new module needs process-lifetime shared state.
- The `send.ts`/`reply.ts` + thin `route.ts` wrapper split (Plan 01-08) for any new route handler whose core logic needs to be `node:test`-runnable outside Next's bundler.
- Locale JSON files (`src/lib/i18n/locales/*.json`) are the existing home for any new static, non-translated UI copy — D-14's notification text belongs here, not in the live translation pipeline.

### Integration Points
- **web-push** (`3.6.7`, Node-runtime-only, `export const runtime = "nodejs"` required on any route calling it) — not yet installed; this phase adds it.
- **Postgres `push_subscriptions` table** — schema already anticipates this per CLAUDE.md's stack doc (`endpoint`, `p256dh`, `auth`, `visitor_id`, `created_at`, `last_success_at`, `failure_count`) but the actual table doesn't exist in `src/server/db/schema.ts` yet (Phase 1's 7 tables didn't include it — verify at planning time whether it needs adding here).
- **OVHcloud/NVIDIA translation call site** — currently only exercised by the disposable `scripts/translation-spike.mjs`; Phase 2 wires a real call into the owner-reply and visitor-message write paths (`src/app/api/chat/messages/send.ts`, `src/app/api/admin/messages/reply.ts`), using Next's `after()` per CLAUDE.md so translation never blocks the response.

</code_context>

<specifics>
## Specific Ideas

- The iOS walkthrough should feel like a normal, quick app-install nudge, not a wall — it appears exactly at the point push is requested, once, and never blocks a returning visitor a second time (D-04/D-06).
- The owner's translation preview should feel like typing normally and having it "just work" — an inline swap they can tap back from, not a separate translation tool bolted onto the composer (D-09).
- Notification copy: short, warm, no preview/sender/faith-reference — the existing tone the welcome/presence copy already established in Phase 1's locale files (D-14).
- "Show original" on the visitor side should read as a familiar, low-weight affordance (WhatsApp/Telegram-style "See original"), not a prominent toggle (D-12).

</specifics>

<deferred>
## Deferred Ideas

- **Qwen3.6-27B cost/latency spike** — declined for Phase 2 (D-08). Revisit only if NVIDIA NIM's 397B model becomes a real latency/cost problem once translation is live in production, carried forward from Phase 1's own deferred list.
- **Gate funnel date-range filtering** — declined for Phase 2 (D-17 chose all-time totals only). Could become a Phase 3 admin-surface enhancement if the owner later wants to spot a recent drop in grant rate.
- **Retry/re-notify action on an unreachable conversation** — declined for Phase 2 (D-19). Belongs with Phase 3's real status controls (ADMIN-05 and related).
- **A dedicated admin screen for gate metrics** — declined in favor of a stats row on the existing list (D-17). Could resurface in Phase 3 if the metrics need more room than a stats row supports.

</deferred>

---

*Phase: 2-Reachability and Language*
*Context gathered: 2026-07-21*
