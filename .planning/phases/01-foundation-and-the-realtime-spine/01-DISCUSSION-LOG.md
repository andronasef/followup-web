# Phase 1: Foundation and the Realtime Spine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-20
**Phase:** 1-Foundation and the Realtime Spine
**Areas discussed:** Spike go/no-go bar, Welcome & presence copy, First load & language picker, Minimal owner surface, SSE resilience, Delivery & failure states

---

## Spike go/no-go bar (FOUND-01)

**Q: If the spike shows Swahili translation is unreliable on every OVH model, what happens?**

| Option | Description | Selected |
|--------|-------------|----------|
| Drop Swahili from the ten | Ship nine languages. Zero added infrastructure, no risk of a mistranslated gospel presentation. Fallback to English or French is common in the target regions. | ✓ |
| Second provider for Swahili only | Keep all ten, route Swahili elsewhere behind the TranslationProvider interface. Second API key, second failure mode, wider Phase 1. | |
| Ship it degraded | Keep Swahili with the original always shown prominently. Cheapest, but normalizes exactly the failure show-original was meant to catch. | |

**User's choice:** Drop Swahili from the ten

---

**Q: Who judges the spike output, and against what?**

| Option | Description | Selected |
|--------|-------------|----------|
| Native-speaker review, small corpus | ~20 real sentences per language, native speaker gives a plain yes/no. Slow to arrange, but the only judgment that means anything for pastoral text. | |
| Round-trip + automated validators | Translate out and back, plus the TRANS-07 validators. Fast, repeatable, CI-runnable — but round-trip fluency does not prove the theology survived. | ✓ |
| Both — validators gate, human decides | Validators screen, native speaker calls it. Most work, strongest evidence. | |

**User's choice:** Round-trip + automated validators
**Notes:** No native-speaker gate. Speed and repeatability chosen over depth of judgment.

---

**Q: Where's the pass line on the automated run?**

| Option | Description | Selected |
|--------|-------------|----------|
| Zero tolerance on injection, soft on fluency | Any injection case where the model answers = automatic fail. Fluency judged loosely. Matches the real risk asymmetry. | |
| Every validator must pass on every case | Strictest and unambiguous, but likely fails Arabic on length-ratio alone, over-trimming the list. | |
| Percentage bar, e.g. 90% clean | Objective and comparable across models, but the number is arbitrary and 10% failure on gospel text is not obviously acceptable. | ✓ |

**User's choice:** Percentage bar, 90% clean

---

**Q: Which models does the spike actually test?**

| Option | Description | Selected |
|--------|-------------|----------|
| Both Qwen candidates, pick the winner | Settles the model-ID config value with evidence instead of a guess. Doubles the run. | |
| Qwen3.5-397B-A17B only | Best-multilingual candidate; if it can't do Swahili nothing can. Fastest answer, leaves the cost question open. | ✓ |
| Whatever GET /v1/models returns | Most thorough given known catalog drift, widest scope, slowest. | |

**User's choice:** Qwen3.5-397B-A17B only

---

**Q: Does the 90% bar apply to prompt-injection cases too?** *(raised by Claude as a conflict — a uniform 90% lets a model author words 1 case in 10, which the product forbids outright)*

| Option | Description | Selected |
|--------|-------------|----------|
| No — injection is pass/fail at 100% | 90% governs fluency drift; any injection failure fails the model outright. | |
| Yes — one bar, 90% across everything | Simpler to score and report. Accepts ~1 in 10 hostile messages could be answered rather than translated, mitigated by the owner reading the original. | ✓ |

**User's choice:** Yes — one bar, 90% across everything
**Notes:** Conflict was explicitly surfaced and the tradeoff knowingly accepted. CONTEXT.md D-03 carries a planner instruction to surface any injection failure explicitly in the go/no-go write-up rather than let it disappear into an aggregate percentage.

---

## Welcome & presence copy (CHAT-02, CHAT-05)

**Q: Is the welcome a real row in the messages table, or rendered client-side?**

| Option | Description | Selected |
|--------|-------------|----------|
| Rendered client-side from locale JSON | No row, no insert, re-renders on language switch, messages table stays purely human-authored. Nothing to replay. | ✓ |
| Stored row, system-authored | Uniform thread, replay-safe — but freezes the welcome in the first-load language and puts non-human text in message history. | |

**User's choice:** Rendered client-side from locale JSON

---

**Q: How does the visitor learn the owner is offline?**

| Option | Description | Selected |
|--------|-------------|----------|
| Baked into the welcome line | Welcome text itself changes. No badge, no dot, one less element on a bare screen. | |
| Welcome plus a quiet status line | Constant welcome, small persistent presence line. Always visible — but a third element in a two-control header, and a live dot invites read-receipt anxiety. | ✓ |

**User's choice:** Welcome plus a quiet status line
**Notes:** CONTEXT.md D-06 flags the CHAT-09 tension — the line is passive text, not a control, and must not read as a support-widget status dot.

---

**Q: Does the status line update live, or is it read-once at page load?**

| Option | Description | Selected |
|--------|-------------|----------|
| Live over the existing SSE stream | Never lies while someone sits on the page. Costs a presence event type and a responders read — both needed by Phase 3 anyway. | ✓ |
| Read once at load | Simplest read path; goes stale during a long session. | |

**User's choice:** Live over the existing SSE stream

---

**Q: How long is the welcome?**

| Option | Description | Selected |
|--------|-------------|----------|
| Two short lines | Warmth plus expectation. Fits above the fold on a phone in every script. Conversation, not landing page. | ✓ |
| A short paragraph | More reassurance for a frightened first-time hearer — but it's the marketing shape the product rejects, times ten translations. | |
| One line | Maximum bareness; risks reading curt, no room for offline honesty. | |

**User's choice:** Two short lines

---

## First load & language picker (LANG-01/02/06, CHAT-09)

**Q: What shape is the language picker on a phone?**

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom sheet, endonyms | Thumb-reachable, readable by someone who can't read English, the pattern messaging apps already taught them. | ✓ |
| Native `<select>` | Free a11y and platform behaviour; ugly on desktop, hard to style warmly. | |
| Inline dropdown menu | Consistent cross-platform; a ten-item list anchored top-of-screen is a thumb stretch on mobile. | |

**User's choice:** Bottom sheet, endonyms

---

**Q: Browser locale is something you don't support (say Bengali). What loads?**

| Option | Description | Selected |
|--------|-------------|----------|
| English, picker visibly nudged | Honest and recoverable without adding a screen. | ✓ |
| Silent English fallback | Simplest — but a visitor who reads no English may not realize the control switches language. | |
| Closest supported match, then English | Better hit rate on regional variants; the mapping table is guesswork outside the ten. | |

**User's choice:** English, picker visibly nudged

---

**Q: Direction and theme on first paint — how hard do we fight the flash?**

*First attempt was interrupted: the user asked "what is flash?" The question was re-presented in plain language after explaining flash-of-wrong-theme and flash-of-wrong-direction, and why the split second matters on a page someone may open at 2am while scared.*

| Option | Description | Selected |
|--------|-------------|----------|
| Put language + theme in the visitor cookie | Server renders correctly in the first byte. Zero flash on return visits; first visit still has one unavoidable moment. | |
| Tiny script that runs before paint | Flash-free even without the cookie — duplicates cookie state and delays first paint slightly. | |
| Both — cookie first, script as backstop | Cookie drives server render; script only corrects a missing-cookie/present-localStorage case. Most robust, more to keep in sync. | ✓ |

**User's choice:** Both — cookie first, script as backstop

---

## Minimal owner surface (ADMIN-01, ADMIN-03)

**Q: What's the smallest owner UI that genuinely proves the spine works?**

| Option | Description | Selected |
|--------|-------------|----------|
| Login + flat conversation list + thread | Three screens, nothing else. Phase 3 replaces the list and keeps the thread. | ✓ |
| Login + single thread by URL | Absolute minimum code; can't discover a new conversation without hitting the DB, making the success criterion awkward to demonstrate. | |
| Login + list with unanswered-first sort | Useful during testing, but it's the first slice of ADMIN-05 — Phase 3 scope leaking early. | |

**User's choice:** Login + flat conversation list + thread

---

**Q: Does the owner's side get realtime too, or just the visitor's?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — same SSE stream, owner scope | One streaming path tested from both ends; proves both directions of the success criterion. | ✓ |
| Visitor only; owner refreshes | Halves the streaming surface — but nothing tests admin scope until Phase 3, and manual reloads hide realtime bugs. | |

**User's choice:** Yes — same SSE stream, owner scope

---

**Q: Owner login — how does the account come into existence?**

| Option | Description | Selected |
|--------|-------------|----------|
| Seed script run manually, off-box | No signup route ever exists in the codebase — no endpoint to accidentally leave open. | |
| Env vars read at startup | Nothing to remember running — but a password hash sits in Coolify's UI and its .env. | |
| One-time setup page, self-disabling | Friendliest — but a live account-creation endpoint on the internet until it's used. | ✓ |

**User's choice:** One-time setup page, self-disabling
**Notes:** Claude flagged this as the highest-risk item in the phase. Not re-litigated; instead CONTEXT.md D-14 carries hard constraints so the window closes by construction: 404 driven by the existence of a `responders` row checked server-side per request, plus a required setup token env var, holding across restarts and redeploys against an existing DB.

---

## SSE resilience (FOUND-02, CHAT-04, CHAT-07)

*First attempt was interrupted: the user asked "what is SSE?" and "what is SSE resilience?" The three questions were re-presented in plain language after explaining Server-Sent Events, the Traefik long-connection risk, and how Last-Event-ID already guarantees nothing is lost — leaving the real choice as whether to pre-empt the break or wait for it.*

**Q: The connection will die unpredictably. Do we get ahead of it?**

| Option | Description | Selected |
|--------|-------------|----------|
| Close and reopen every ~4 minutes, on purpose | Catch-up code runs hundreds of times a day, so a break is found immediately rather than during a real outage. | ✓ *(Claude's discretion)* |
| Keep it open as long as possible, recover when it dies | Fewer reconnections — but the recovery path only runs when something has already gone wrong. | |

**User's choice:** "do the best" — deferred to Claude
**Notes:** Claude selected the deliberate ~4-minute recycle. Rationale recorded in CONTEXT.md D-15; planner may revisit only if research surfaces a concrete reason the recycle is worse on the target Coolify/Traefik version.

---

**Q: Do we build a backup way of getting messages, just in case?**

| Option | Description | Selected |
|--------|-------------|----------|
| Build the backup, leave it switched off | `GET /api/messages?since=<id>` is needed for catch-up anyway, so it's nearly free. A broken proxy becomes a flag flip, not new code under pressure. | ✓ |
| Don't build it unless it's needed | Less surface — but Phase 1 would grow a new client path right as it's meant to close. | |

**User's choice:** Build the backup, leave it switched off

---

**Q: Does the visitor ever see that the connection dropped?**

| Option | Description | Selected |
|--------|-------------|----------|
| No — handle it silently | Reconnecting is normal, not a fault; a warning would blink forever and there's nothing the visitor could do. | |
| Only if it's genuinely stuck | Silent through routine recycles, small "reconnecting" line if truly stuck. One more piece of UI on a bare screen. | ✓ |

**User's choice:** Only if it's genuinely stuck

---

## Delivery & failure states (CHAT-03, CHAT-06)

**Q: Visitor hits send. What appears, and when?**

| Option | Description | Selected |
|--------|-------------|----------|
| Bubble appears instantly, confirms quietly | Feels instant like every messaging app they already use; on failure only that bubble changes. | ✓ |
| Wait for the server, then show it | Always truthful — but a second of tapping send and seeing nothing reads as broken and causes re-sends. | |

**User's choice:** Bubble appears instantly, confirms quietly

---

**Q: The send fails — no signal, server down. What happens to their words?**

| Option | Description | Selected |
|--------|-------------|----------|
| Retry automatically, keep the text safe | Quiet retries, then tap-to-retry. Someone who just typed something hard to say doesn't type it twice. | ✓ |
| Show the failure, they retry manually | Simple and predictable — but a tunnel or a lift becomes a visible error the visitor must handle. | |

**User's choice:** Retry automatically, keep the text safe

---

**Q: Does the visitor ever see more than 'sent'?**

| Option | Description | Selected |
|--------|-------------|----------|
| No — 'sent' and nothing further | Matches the locked requirement exactly; "seen" with no reply manufactures rejection out of ordinary latency. | |
| Sent, plus a failed state | Same, plus a message that genuinely couldn't be stored is visibly marked rather than silently swallowed. | ✓ |

**User's choice:** Sent, plus a failed state

---

## Claude's Discretion

- **SSE stream lifetime (D-15)** — user answered "do the best". Claude chose the deliberate ~4-minute server-side recycle over hold-open-with-heartbeat.
- **Rate-limit numbers and limited-state copy (OPS-01)** — offered as an area, not selected. Left to researcher/planner within one binding product constraint: someone in crisis typing fast must not be stonewalled.
- **Schema shape, migration layout, SSE payload format, `responders`/assignment column internals** — no preference expressed, none needed.

## Deferred Ideas

- Second translation provider / per-language routing — already v2; explicitly declined as the Swahili remedy. The `TranslationProvider` seam still ships in Phase 1.
- Testing `Qwen3.6-27B` — cost/latency comparison left open for Phase 2.
- Owner presence toggle — Phase 3 (ADMIN-04); Phase 1 builds only the read path it rides on.
- Prioritized inbox, filters, search, counts, status and faith controls — Phase 3; the flat list in D-12 keeps them from leaking early.
