# Phase 2: Reachability and Language - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-21
**Phase:** 2-Reachability and Language
**Areas discussed:** VAPID key generation & backup, iOS install walkthrough, Translation provider going forward, Owner draft-preview & show-original UX, Push notification copy & urgency, Subscription refresh & re-registration, Gate funnel metrics dashboard, Revoked-subscription visibility to the owner

---

## VAPID key generation & backup

| Option | Description | Selected |
|--------|-------------|----------|
| I generate it myself, off-box | Recommended — run `npx web-push generate-vapid-keys` off-box before planning locks env var names | ✓ |
| Claude generates it during Phase 2 execution | An executor runs it during a plan task | |

**User's choice:** I generate it myself, off-box

| Option | Description | Selected |
|--------|-------------|----------|
| Password manager (e.g. 1Password/Bitwarden) | Recommended — encrypted, notice if missing | |
| A second physical/cloud location I control | A private note somewhere Dokploy's failure can't take out too | ✓ |
| Not sure yet — flag it as a todo | Note as open item | |

**User's choice:** A second physical/cloud location I control

| Option | Description | Selected |
|--------|-------------|----------|
| Permanent — never rotate | Recommended per CLAUDE.md — rotating loses every visitor | |
| Rotate if ever compromised, accepting the visitor loss | Break-glass procedure only | ✓ |

**User's choice:** Rotate if ever compromised, accepting the visitor loss

---

## iOS install walkthrough

| Option | Description | Selected |
|--------|-------------|----------|
| Only when they hit the push gate | Recommended — normal chat first, walkthrough only at the gate | ✓ |
| Shown immediately on first iPhone Safari visit | Front-loads friction before conversation starts | |

**User's choice:** Only when they hit the push gate

| Option | Description | Selected |
|--------|-------------|----------|
| Static step-by-step with the real Safari icons | Recommended for Phase 2 scope | |
| Animated/GIF-style walkthrough | More polished, more design/build effort | ✓ |

**User's choice:** Animated/GIF-style walkthrough

| Option | Description | Selected |
|--------|-------------|----------|
| Show the walkthrough again every time until installed | Recommended — consistent with hard gate | |
| Let them chat without push after N attempts | Softens the hard-gate requirement | ✓ |

**User's choice:** Let them chat without push after N attempts

**Notes:** This directly conflicted with ROADMAP.md's locked success criterion 2 (unconditional hard gate). Flagged explicitly as a requirements-change decision, not an implementation detail.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep it a hard gate — no exceptions, ever | Matches what's currently locked in ROADMAP.md/PROJECT.md | |
| Soften to allow chat after N attempts — update the roadmap | A real requirements change, roadmap updated to match | ✓ |

**User's choice:** Soften to allow chat after N attempts — update the roadmap

| Option | Description | Selected |
|--------|-------------|----------|
| 1 — shown once, then let through | Simplest | ✓ |
| 3 | Shown on first three visits/attempts | |

**User's choice:** 1 — shown once, then let through

**Notes:** ROADMAP.md §Phase 2 success criterion 2 and PROJECT.md's "Push gate" section were both updated in this session to reflect the softened gate (shown once per device, then let through).

---

## Translation provider going forward

| Option | Description | Selected |
|--------|-------------|----------|
| Stick with NVIDIA NIM | Recommended — already proven in Phase 1's spike | ✓ |
| Switch to OVH now | Only if an OVH key now exists | |
| I have an OVH key now, use it | Confirms prerequisite met | |

**User's choice:** Stick with NVIDIA NIM

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — worth knowing before scaling up | Spike Qwen3.6-27B for cost/latency | |
| No — 397B works, don't add scope | Recommended — keep Phase 2 focused | ✓ |

**User's choice:** No — 397B works, don't add scope

---

## Owner draft-preview & show-original UX

| Option | Description | Selected |
|--------|-------------|----------|
| Inline swap — owner sees translation replace their draft | Simple, one field, fits phone screens | ✓ |
| Side-by-side — both shown at once | Needs more screen space | |

**User's choice:** Inline swap — owner sees translation replace their draft

| Option | Description | Selected |
|--------|-------------|----------|
| Approve or send-as-original only, no editing the translation | Recommended — owner may not verify target-language edits | |
| Owner can edit the translated text directly | Assumes some target-language literacy | ✓ |

**User's choice:** Owner can edit the translated text directly

**Notes:** Claude flagged the risk (owner editing text they may not be able to verify) — captured as a discretion note in CONTEXT.md, not blocking. The show-original tap-through (next area) is the accepted safety net.

| Option | Description | Selected |
|--------|-------------|----------|
| A small tap-to-expand link under the translated bubble | Recommended — matches WhatsApp/Telegram pattern | ✓ |
| Always show both original and translation stacked | Doubles visual space per message | |

**User's choice:** A small tap-to-expand link under the translated bubble

---

## Push notification copy & urgency

| Option | Description | Selected |
|--------|-------------|----------|
| One combined notification (topic-based coalescing) | Recommended — uses web-push's `topic` field | ✓ |
| One notification per reply, no coalescing | Simpler but could stack up the lock screen | |

**User's choice:** One combined notification (topic-based coalescing)

| Option | Description | Selected |
|--------|-------------|----------|
| One short, warm locked phrase per language, translated once and reused | Recommended — UI chrome, not message content | ✓ |
| Machine-translate the notification text live like message content | Unnecessary — no visitor-specific content to translate | |

**User's choice:** One short, warm locked phrase per language, translated once and reused

---

## Subscription refresh & re-registration

| Option | Description | Selected |
|--------|-------------|----------|
| Fully silent, always | Recommended — routine background housekeeping | ✓ |
| Silent unless re-registration itself fails | Shows a small indicator on failure | |

**User's choice:** Fully silent, always

| Option | Description | Selected |
|--------|-------------|----------|
| Retry silently in the background, no visitor-facing action needed | Simplest, matches "no alarming errors" feel | ✓ |
| After repeated failures, gently prompt them through the gate/install flow again | More proactive | |

**User's choice:** Retry silently in the background, no visitor-facing action needed

---

## Gate funnel metrics dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| A small stats row on the existing conversation-list screen | Recommended — no new screen, fits Phase 1's minimal admin | ✓ |
| A dedicated new admin screen just for this | More room, but a 4th admin screen | |

**User's choice:** A small stats row on the existing conversation-list screen

| Option | Description | Selected |
|--------|-------------|----------|
| All-time totals only | Recommended for Phase 2 scope | ✓ |
| A simple date range toggle (e.g. 7d/30d/all) | More useful but more complexity | |

**User's choice:** All-time totals only

---

## Revoked-subscription visibility to the owner

| Option | Description | Selected |
|--------|-------------|----------|
| A small quiet label/badge on that row (e.g. "unreachable") | Recommended — matches Phase 1's flat-list simplicity | ✓ |
| Move it to a separate section/filter | Introduces sorting/grouping Phase 1 deliberately deferred | |

**User's choice:** A small quiet label/badge on that row (e.g. "unreachable")

| Option | Description | Selected |
|--------|-------------|----------|
| Purely informational — no action needed | Recommended — matches Phase 1's D-12 boundary | ✓ |
| A manual "retry/re-notify" action | Pulls Phase 3 status-control scope forward | |

**User's choice:** Purely informational — no action needed

---

## Claude's Discretion

- D-10's edit-translation risk (owner editing translated text they may not verify) — no further mitigation requested beyond the existing show-original tap-through.
- Exact visual treatment of the "unreachable" badge and the stats row's number formatting — left to planner/researcher.
- Exact GIF/animation content and pacing for the iOS walkthrough — left to planner/researcher; only style (animated) and trigger point (at the gate) were specified.

## Deferred Ideas

- Qwen3.6-27B cost/latency spike — declined for Phase 2, revisit only if 397B latency/cost becomes a real production problem.
- Gate funnel date-range filtering — declined for Phase 2, possible Phase 3 admin enhancement.
- Retry/re-notify action on an unreachable conversation — declined for Phase 2, belongs with Phase 3's real status controls.
- A dedicated admin screen for gate metrics — declined in favor of a stats row; could resurface in Phase 3 if metrics need more room.
