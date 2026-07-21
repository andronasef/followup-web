# One Chat

## What This Is

A website that is not a website in the traditional sense — no pages, no menus, no marketing sections. The URL opens straight into a single, full-screen, one-on-one chat with a real human (the owner), in the visitor's own language and preferred light/dark appearance. It exists to give people curious about Christ — often first-time hearers — a safe, personal place to talk, ask, and if they choose, take a step of faith, with follow-up happening in that same conversation.

Visitors are fully anonymous: no accounts, no logins, no name, email, or phone. They are recognized only by a random ID in their own browser and reached again only via browser push. The owner runs everything from a separate, password-protected Admin Dashboard.

## Core Value

A person opens the URL and, within seconds, is in a warm conversation with a real human being in their own language — and can always be reached again when that human replies.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Visitor chat**
- [ ] URL opens directly into a full-screen one-on-one chat, no landing page, no visitor login
- [ ] Minimal header with exactly two controls: language picker and light/dark toggle
- [ ] Anonymous ID issued as a server-set httpOnly cookie on first visit, mirrored to localStorage
- [ ] On return from the same browser, conversation + language + appearance are restored
- [ ] Warm welcome message on open, in the owner's voice, in the visitor's language
- [ ] Owner online → near real-time two-way chat; owner offline → welcome-only, messages still stored
- [ ] No message is ever lost; all persist until answered

**Language & appearance**
- [ ] Language auto-detected from browser locale, manually overridable, persisted
- [ ] Full RTL/LTR layout switching based on selected language
- [ ] Light/dark auto-detected from system preference, manually overridable, persisted
- [ ] All interface strings, welcome, gate copy, and system messages localized into the supported languages

**Push gate**
- [ ] Visitor must accept browser notifications before the chat opens, shown once per device (softened from an unconditional hard block — Phase 2 discussion, 2026-07-21: declining or ignoring it on the first attempt lets the visitor through to chat without push from their next visit onward)
- [ ] Declining shows a gentle, localized re-ask explaining why
- [ ] iOS visitors get a guided "Share → Add to Home Screen" screen before the push prompt
- [ ] On owner reply, a localized "new reply" push reaches the visitor and reopens the conversation
- [ ] Push payloads are content-free — no message preview, no sender, no faith reference

**Translation**
- [ ] Visitor messages translated into the owner's language, original viewable
- [ ] Owner replies translated into the visitor's language on send, with preview before sending

**Admin dashboard**
- [ ] Secure owner-only login (email + password), mobile-friendly, light/dark aware
- [ ] Online/offline presence toggle with clear state indicator
- [ ] Inbox with priority sort — faith decisions first, then most recent / unanswered
- [ ] Filters (All / Decisions / New / In progress / Closed) and search across conversations
- [ ] Conversation view with translated + original text, reply box, status controls
- [ ] Manual faith-decision flag; at-a-glance counts (new, decisions waiting, unanswered)

**Safety & operations**
- [ ] Per-anonymous-ID and per-hashed-IP message rate limiting (HMAC the IP — never store it raw)
- [ ] Reconnecting clients backfill missed messages via Last-Event-ID cursor against `messages.id`
- [ ] Owner can block an abusive visitor from the dashboard
- [ ] Owner can manually delete a conversation

### Out of Scope

- AI/chatbot answering on the owner's behalf — a real human must author every word; translation only carries the words across
- Visitor login, account creation, or collection of any personal contact info — anonymity is the feature, not a limitation
- Public content library, blog, or media pages — the chat is the whole product
- Multi-agent team management and inbox routing — single responder for v1, but must not be architecturally blocked
- Analytics dashboards beyond the at-a-glance counts — not what this is for
- Automated content moderation filtering — high false-positive risk on faith and crisis language; owner block + rate limit covers v1
- Automatic data retention purging — conversations are relationships, not tickets; a visitor may return in a year

## Context

Source document: `PRD-chat-site.md` (v4.0). This project initialization resolved that PRD's §12 open questions.

**Where visitors come from:** typically a link shared from inside the owner's own app(s), overwhelmingly on mobile.

**Accepted identity limits:** clearing the browser, private mode, or switching device produces a brand-new visitor with no link back. The owner cannot reach anyone who does this. This is accepted as the price of anonymity.

**Entry is always a real browser** — the owner will share the URL so it opens in Safari/Chrome, never in an in-app WebView. This matters: a WebView has no "Add to Home Screen" path, which would make the hard push gate a dead end on iOS with no route forward. The guided install screen therefore only has to handle real iOS Safari.

**Supported languages (10):** Arabic, English, Spanish, French, Portuguese, Hindi, Mandarin Chinese, Russian, Indonesian, Swahili.

**Translation provider research (verified 2026-07-20):** OVHcloud AI Endpoints is OpenAI-compatible at `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` with `Authorization: Bearer <key>`. Findings that shape the build:
- The anonymous free tier is 2 requests/min per IP — unusable. An OVH Public Cloud project and API key are required (400 rpm per model, pay-as-you-go per token). Generating that key is a manual owner prerequisite.
- There is no translation model and no `/v1/translations` endpoint. Translation is a chat completion with a system prompt at `temperature: 0`.
- Candidate models: `Qwen3.6-27B` (balance), `Qwen3.5-397B-A17B` (best multilingual). `Meta-Llama-3_3-70B-Instruct` does *not* officially cover Arabic, Chinese, Russian, Indonesian, or Swahili — do not use it.
- **No model on the platform documents Swahili support.** This is the single largest technical risk in the project.
- All inference runs in Gravelines, France (EU residency) — a genuine advantage for sensitive pastoral conversations.
- Model IDs drift between the marketing catalog and live `GET /v1/models`. Pin IDs in config, not code.

**Open risk:** if the Phase 1 translation spike fails on Swahili, the choice is to drop Swahili from the 10 or add a second provider for that language only. The spike runs before the locale files are written.

## Constraints

- **Hosting**: Self-hosted Docker on Coolify — owner controls the infrastructure; no managed-vendor lock-in.
- **Tech stack**: Next.js (App Router) single deployable + Postgres. One container, one DB service.
- **Realtime**: Postgres `LISTEN/NOTIFY` → Server-Sent Events. No Pusher, no socket.io — sends go over `fetch`, so one-directional SSE is sufficient.
- **Push**: `web-push` with self-generated VAPID keys. No FCM.
- **Auth**: `@node-rs/argon2` (Argon2id) hash in the DB + signed httpOnly session cookie via `jose`. No NextAuth — there is exactly one user. *Not bcrypt* — OWASP now scopes it to legacy systems, and the native module fails in an Alpine multi-stage build.
- **TypeScript**: pinned to `6.0.3` exactly. TypeScript 7 dropped `lib/typescript.js` and breaks Next 16.2's TypeScript detection.
- **Secrets**: VAPID keys are generated once, off-box, and backed up. Losing them makes every existing visitor permanently unreachable — the only unrecoverable event in the system.
- **i18n**: static JSON locale files + a small lookup. No i18next. RTL via CSS logical properties and `<html dir>`, so one stylesheet serves both directions.
- **Translation**: OVHcloud AI Endpoints via the OpenAI SDK. Requires 429 backoff and per-message caching.
- **Mobile-first**: most visitors arrive from mobile; the admin dashboard must work well on a phone.
- **Privacy**: no personal data may be collected or stored. Anonymity is a hard requirement, not a preference.
- **Expandable**: structured so additional responders can be added later without a rebuild.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Self-hosted Docker on Coolify | Owner controls infrastructure and data for sensitive pastoral conversations; no per-seat vendor costs | — Pending |
| OVHcloud AI Endpoints for translation | Free/cheap, OpenAI-compatible, EU data residency (Gravelines) — matters for confidential faith conversations | — Pending |
| Hard block on push refusal | Reachability is the second goal of the product; an unreachable visitor is a lost person | — Pending |
| iOS guided "Add to Home Screen" screen | iOS Safari only permits push for installed PWAs; a hard block without guidance would silently lose every iPhone visitor | — Pending |
| Email + password admin auth, Argon2id | Single owner, self-hosted, no external identity provider. Argon2id over bcrypt per OWASP 2026 guidance and Alpine build compatibility | — Pending |
| Anonymous ID as server-set httpOnly cookie | A client-generated localStorage UUID is an XSS-exfiltratable bearer token to a pastoral conversation, and WebKit ITP evicts script-writable storage after 7 idle days — a return-visitor loss mode the PRD never accepted | — Pending |
| Content-free push payloads | A lock-screen faith reference is a physical-safety risk in several target regions. Flagged independently by two researchers | — Pending |
| Last-Event-ID cursor replay from day one | LISTEN/NOTIFY is fire-and-forget and cannot alone satisfy "no message is ever lost"; `messages.id` as the SSE event id makes backfill a query rather than a subsystem | — Pending |
| Owner shares the URL to open in a real browser, never a WebView | A WebView has no Add-to-Home-Screen path, which would turn the hard push gate into an iOS dead end | — Pending |
| Keep conversations indefinitely | These are relationships, not tickets; no personal data is stored, so retention risk is low. Manual delete available | — Pending |
| Rate limit + owner block for abuse | Anonymous frictionless entry needs a floor, but automated moderation false-positives on faith and crisis language | — Pending |
| Next.js single deployable, SSE over Postgres NOTIFY | Fewest moving parts that satisfy near-real-time chat; avoids a second realtime service in the container stack | — Pending |
| Translation spike runs first | Swahili support is undocumented on every OVH model; the answer changes the language list, which everything else localizes against | — Pending |
| Deferred: faith-content translation glossary | The "show original" safeguard covers v1; revisit after seeing real mistranslations | — Pending |
| Deferred: second-responder scale trigger | Out of scope for v1, but the schema must not block it | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-20 after initialization*
