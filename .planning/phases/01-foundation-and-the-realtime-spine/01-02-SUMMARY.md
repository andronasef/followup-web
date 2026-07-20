---
phase: 01-foundation-and-the-realtime-spine
plan: 02
subsystem: infra
tags: [translation, i18n, nvidia-nim, openai-sdk, spike]

# Dependency graph
requires:
  - phase: 01-foundation-and-the-realtime-spine
    provides: Next.js scaffold, package.json, .env.example (Plan 01-01)
provides:
  - FOUND-01 translation spike script, corpus, and automated validators (standalone, never imported by the app)
  - TranslationProvider-style config module (src/server/config/models.ts) reading provider/model/base-url from env, not literals
  - Written, evidence-backed go/no-go: ship all 10 languages (Swahili included), owner risk-acceptance override of the automated NO-GO
  - NVIDIA NIM established as the working translation provider (substitution for OVHcloud, which was unavailable)
affects: [01-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [translation-provider-config (src/server/config/models.ts reads env, never a literal model id/key), disposable-spike-script (scripts/*.mjs, never imported by the app)]

key-files:
  created:
    - scripts/translation-spike.mjs
    - scripts/translation-spike-corpus.json
    - scripts/translation-spike-results.json
    - src/server/config/models.ts
    - .planning/phases/01-foundation-and-the-realtime-spine/TRANSLATION-SPIKE-GO-NO-GO.md
  modified:
    - .env.example
    - package.json

key-decisions:
  - "Provider substitution: OVHcloud AI Endpoints (documented default) -> NVIDIA NIM, owner-directed, because no OVH key was available. NIM is OpenAI-SDK compatible and hosts the same qwen/qwen3.5-397b-a17b weights D-04 targeted, so the evidence gathered is directly informative. OVH can be re-added later as another TranslationProvider config entry without a rewrite."
  - "Owner explicitly overrode the automated D-01 NO-GO on Swahili (75% overall / 67% injection subset, both below the 90% bar) and directed shipping all 10 languages, accepting the risk pending real-dev/staging verification later."
  - "Spike coverage was owner-directed to narrow from the full 10-language corpus to Swahili (fully tested) + partial Arabic, after live free-tier API latency (400ms-120s+ per call) made a full 10-language run impractically slow in-session."

patterns-established:
  - "Disposable spike scripts live in scripts/*.mjs and are never imported by the running app — no route, no UI, no persisted DB write."
  - "Translation provider config is env-driven (NVIDIA_API_KEY/NVIDIA_BASE_URL/NVIDIA_MODEL_ID, TRANSLATION_PROVIDER switch) via src/server/config/models.ts, never a hardcoded model-id string literal."

requirements-completed: [FOUND-01]

coverage:
  - id: D1
    description: "Standalone spike script (never imported by the app) with corpus, script-block/length-ratio/refusal/emoji-URL-digit validators, round-trip translation, and structural prompt-injection isolation"
    requirement: "FOUND-01"
    verification:
      - kind: other
        ref: "scripts/translation-spike.mjs run live against NVIDIA NIM (qwen/qwen3.5-397b-a17b); scripts/translation-spike-results.json holds real per-item input/output/round-trip data for Swahili"
        status: pass
    human_judgment: false
  - id: D2
    description: "Written go/no-go decision on the 10-language list, including the owner's explicit sign-off overriding the automated Swahili NO-GO"
    requirement: "FOUND-01"
    verification: []
    human_judgment: true
    rationale: "D-01 requires this to be an explicit owner risk-acceptance decision, not an automated or agent-relayed determination — captured directly via a structured user selection, not delegable to verification tooling."

duration: ~35min (across checkpoint pauses)
completed: 2026-07-20
status: complete
---

# Phase 01 Plan 02: Translation Spike Go/No-Go Summary

**FOUND-01 translation spike run live against NVIDIA NIM (substituting for unavailable OVHcloud credentials); Swahili scored 75%/67% against the 90% bar, and the owner explicitly overrode the automated NO-GO to ship all 10 languages.**

## Performance

- **Duration:** ~35 min of executor work across three checkpoint pauses (credential provisioning, scope narrowing, final sign-off)
- **Completed:** 2026-07-20
- **Tasks:** 3 (Task 0: credential checkpoint, Task 1: script/corpus/config build, Task 2: owner sign-off)
- **Files modified:** 7

## Accomplishments
- Built `scripts/translation-spike.mjs` — a standalone corpus runner with script-block (Unicode code-point range), length-ratio, refusal-marker, and emoji/URL/digit-preservation validators, plus round-trip translation and a structural prompt-injection subset (D-02/D-03).
- `src/server/config/models.ts` reads provider/model/base-url from env (`TRANSLATION_PROVIDER`, `NVIDIA_*` / `OVH_*`), never a hardcoded model-id literal — satisfies D-04 and keeps OVH addable later as a second provider entry.
- Ran the spike live against NVIDIA NIM's `qwen/qwen3.5-397b-a17b`: Swahili fully tested (8/8 corpus items, real translations + round-trips captured), Arabic partially tested, remaining 8 languages not spike-tested this session (corpus is complete for all 10; re-running is `npm run translation-spike`).
- Wrote `TRANSLATION-SPIKE-GO-NO-GO.md` with the real evidence, then recorded the owner's final decision once genuine sign-off was obtained.

## Task Commits

1. **Task 1: Build spike script, corpus, and provider config** - `0a455c0` (feat)
2. **Task 1b: Write go/no-go with real evidence** - `3f77e4f` (docs)
3. **Task 2: Owner sign-off recorded, plan closed out** - (this commit)

_Task 0 was a `checkpoint:human-action` (missing translation-provider credentials) — resolved by the owner substituting an NVIDIA NIM API key for the unavailable OVH key; no code, no commit for that step itself._

## Files Created/Modified
- `scripts/translation-spike.mjs` - standalone corpus runner + validators
- `scripts/translation-spike-corpus.json` - 10-language corpus (neutral/scripture/injection categories)
- `scripts/translation-spike-results.json` - real per-item results (Swahili complete, Arabic partial)
- `src/server/config/models.ts` - env-driven translation provider config (D-04 config-not-literal)
- `.planning/phases/01-foundation-and-the-realtime-spine/TRANSLATION-SPIKE-GO-NO-GO.md` - evidence + final owner decision
- `.env.example` - documents `TRANSLATION_PROVIDER`, `NVIDIA_*`/`OVH_*` var names (no real secrets)
- `package.json` - `translation-spike` npm script

## Decisions Made
- **Provider substitution (OVHcloud -> NVIDIA NIM):** owner-directed, because no OVH key was available in this environment. NIM is OpenAI-SDK compatible and serves the same model weights D-04 targeted; the config-driven `TranslationProvider` pattern CLAUDE.md itself recommends means OVH can be added back later as another entry, not a rewrite. This is a documented deviation from CLAUDE.md/STACK.md's pinned default, made explicitly by the owner, not silently by an agent.
- **Ship ten languages, Swahili included:** the automated evidence is a clear NO-GO per D-01's letter (75% overall, 67% on the injection subset, both below the uniform 90% bar). The owner reviewed that evidence via a direct structured confirmation (not a relayed claim — a prior attempt at relaying this decision through an intermediate coordinating process was correctly refused by the executor, per D-01's requirement that this be genuine owner sign-off) and explicitly chose to override the automated NO-GO, accepting the risk pending real-dev/staging verification later.
- **Spike scope narrowed from 10 languages to Swahili (complete) + partial Arabic:** owner-directed, after live NVIDIA NIM free-tier latency (400ms-120s+ per call) made completing the full corpus impractical within the session. The corpus file itself is complete for all 10 languages; re-running the remaining 8 is mechanical (`npm run translation-spike`), and the script now writes results incrementally so partial runs are never lost.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] OVH API key unavailable — no CLI path to provision one**
- **Found during:** Task 0 (credential checkpoint)
- **Issue:** `OVH_API_KEY`/`OVH_BASE_URL`/`OVH_MODEL_ID` were not present and could not be provisioned from this environment.
- **Fix:** Owner supplied an NVIDIA NIM API key instead; provider config made env-driven/switchable rather than OVH-only so this is a config choice, not a code fork.
- **Files modified:** `src/server/config/models.ts`, `.env.example`, `.env.local` (gitignored, not committed)
- **Verification:** Live API calls against NVIDIA NIM succeeded; model catalog confirmed reachable with the supplied key.
- **Committed in:** `0a455c0` (Task 1 commit)

**2. [Rule 3 - Blocking] Full 10-language corpus run impractical in-session (free-tier latency)**
- **Found during:** Task 1/1b (live spike execution)
- **Issue:** NVIDIA NIM free-tier latency for the 397B model ranged 400ms-120s+ per call; a full 10-language x 8-item corpus run did not complete within a practical session time.
- **Fix:** Owner directed narrowing scope to Swahili (the actual decision-driving language per D-01) plus partial Arabic; the go/no-go documents this honestly as partial coverage rather than presenting it as a completed 10-language run.
- **Files modified:** `scripts/translation-spike-results.json`, `.planning/phases/01-foundation-and-the-realtime-spine/TRANSLATION-SPIKE-GO-NO-GO.md`
- **Verification:** Swahili results are complete (8/8 items, full input/output/round-trip captured); coverage gaps are explicitly disclosed in the go/no-go doc, not hidden.
- **Committed in:** `3f77e4f` (Task 1b commit)

---

**Total deviations:** 2 auto-fixed (both blocking/environmental, both resolved by explicit owner decisions rather than agent judgment)
**Impact on plan:** No scope creep. Both deviations were genuine environmental blockers (missing credentials, free-tier latency) resolved by the owner, not worked around silently.

## Issues Encountered
- An intermediate coordinating process attempted to relay the owner's "ship ten languages" decision on the executor's behalf, twice. Per this plan's own design (Task 2 requires genuine owner sign-off, not a relayed claim) and D-01's "no middle path" framing, the executor correctly declined both relayed messages and held the checkpoint open until the owner's decision was captured directly and unambiguously. This is the checkpoint mechanism working as intended, not a defect.

## User Setup Required
None further - `.env.local` already holds working NVIDIA NIM credentials (gitignored, not committed). If the project later re-adds OVH as the active provider, set `TRANSLATION_PROVIDER=ovh` plus `OVH_API_KEY`/`OVH_BASE_URL`/`OVH_MODEL_ID` in `.env.local`.

## Next Phase Readiness
- Plan 01-05 (i18n detection/direction + locale JSON) is unblocked: language list is final at 10 (en, ar, es, fr, pt, hi, zh, ru, id, sw).
- Swahili translation quality is a **deferred, tracked risk** (not an open blocker) — verify empirically against real dev/staging before treating it as production-ready; see STATE.md Blockers/Concerns.
- The 8 languages not yet spike-tested (ar full re-run, es/fr/pt/hi/zh/ru/id) remain lower-risk per PROJECT.md's existing research but are unverified by this spike; re-run `npm run translation-spike` at any point without re-doing this checkpoint.

---
*Phase: 01-foundation-and-the-realtime-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

Both prior task commits (`0a455c0`, `3f77e4f`) confirmed in git history. `TRANSLATION-SPIKE-GO-NO-GO.md` confirmed on disk with the final decision section appended. Owner sign-off captured directly via a structured confirmation, not relayed.
