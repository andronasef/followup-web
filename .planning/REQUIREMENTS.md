# Requirements — One Chat v1

Derived from `PRD-chat-site.md` v4.0 (F1–F23), the decisions locked at initialization, and `.planning/research/SUMMARY.md`.

Requirement IDs are stable. PRD traceability is noted per requirement as `(F#)`.

---

## v1 Requirements

### Chat — the visitor experience

- [ ] **CHAT-01**: Visitor opens the URL and lands directly in a full-screen one-on-one chat — no landing page, no menu, no login (F1)
- [x] **CHAT-02**: Visitor sees a warm welcome message in their own language, in the owner's voice, on first open (F13)
- [x] **CHAT-03**: Visitor can send a message and see it appear immediately with a single "sent" delivery state
- [x] **CHAT-04**: Visitor sees the owner's reply arrive in near real-time while the owner is online (F15)
- [x] **CHAT-05**: Visitor can send messages while the owner is offline, and the welcome sets that expectation honestly without a queue counter or ETA (F15)
- [x] **CHAT-06**: Every message is persisted before any downstream work runs; no message is lost in any failure mode (F16)
- [x] **CHAT-07**: A reconnecting visitor receives every message sent while disconnected, via a `Last-Event-ID` cursor against `messages.id`
- [x] **CHAT-08**: Returning visitor from the same browser lands back in their existing conversation with history intact (F10)
- [x] **CHAT-09**: Header shows exactly two controls — language picker and light/dark toggle — and nothing else (F2)

### Identity — anonymous and durable

- [x] **ID-01**: On first visit the server issues an anonymous visitor ID as a signed `HttpOnly` `Secure` `SameSite=Lax` cookie (F3)
- [x] **ID-02**: The visitor ID is mirrored to `localStorage` as a recovery copy; the cookie wins on conflict
- [ ] **ID-03**: A visitor's push endpoint resolves back to their visitor ID, giving a third recovery anchor when cookie and localStorage are both lost
- [ ] **ID-04**: The signed visitor ID is carried through the PWA `start_url` and the push click URL, so an installed app and a browser tab resolve to the same conversation
- [x] **ID-05**: No name, email, phone, or raw IP is ever collected or stored

### Language and appearance

- [x] **LANG-01**: Interface language is auto-detected from the browser locale on first load (F4)
- [x] **LANG-02**: Visitor can override the language from the header picker; the choice persists across visits (F4)
- [x] **LANG-03**: Layout switches fully between RTL and LTR with the selected language (F5)
- [ ] **LANG-04**: Mixed-direction content renders correctly — a Latin URL or scripture reference inside an Arabic message is bidi-isolated and not mangled
- [x] **LANG-05**: Directional icons mirror by allowlist; timestamps, digits, and logos do not
- [x] **LANG-06**: Light/dark is auto-detected from the system preference and overridable from the header; the choice persists (F6)
- [x] **LANG-07**: All interface strings, the welcome, gate copy, and system messages are localized into the confirmed language list (F7)

### Push — the gate and the return path

- [ ] **PUSH-01**: The chat does not open until the visitor grants browser notification permission — a hard block (F8)
- [ ] **PUSH-02**: A custom pre-prompt explains why before the native permission prompt is triggered, so a decline remains recoverable (the native prompt fires only once, ever)
- [ ] **PUSH-03**: Declining shows a gentle, localized re-ask explaining the reason (F9)
- [ ] **PUSH-04**: `requestPermission()` is called as the first statement in the click handler — no `await` before it, which would launder the user gesture
- [ ] **PUSH-05**: iOS Safari visitors get a guided, localized "Share → Add to Home Screen" screen, then the permission prompt after relaunch
- [ ] **PUSH-06**: When the owner replies, the visitor receives a localized push that reopens their conversation (F17)
- [ ] **PUSH-07**: Push payloads are content-free — no message preview, no sender name, no faith reference
- [ ] **PUSH-08**: Push fires only when the visitor has not acknowledged delivery, gated by a durable `delivered_at` ACK plus a short grace period — not by in-memory connection state
- [ ] **PUSH-09**: The service worker always calls `showNotification()` on receipt; silent pushes risk permission revocation, which is fatal when push is the entry gate
- [ ] **PUSH-10**: Subscriptions returning 404/410 are deleted and the conversation is marked unreachable in the dashboard
- [ ] **PUSH-11**: The client re-syncs `getSubscription()` on every open, because Chrome does not reliably fire `pushsubscriptionchange`
- [ ] **PUSH-12**: A round-trip probe confirms push actually works at the moment permission is granted

### Translation — carrier, never author

- [ ] **TRANS-01**: Visitor messages are translated into the owner's language for the dashboard (F11)
- [ ] **TRANS-02**: Owner replies are translated into the visitor's language on send (F12)
- [ ] **TRANS-03**: The owner previews the translation before the reply sends, and can send anyway if translation fails or times out (F12)
- [ ] **TRANS-04**: Both sides can reveal the original text alongside the translation, per message (F11, F12)
- [ ] **TRANS-05**: Visitor→owner translation runs asynchronously *after* the message is durably persisted — the translation provider is never a prerequisite for durability
- [ ] **TRANS-06**: Each `(message, target language)` pair is translated at most once; same-language pairs are skipped entirely
- [ ] **TRANS-07**: Translation output is validated at runtime (script-block match, length ratio, refusal markers, preservation of emoji/URLs/digits) and fails toward showing the untranslated original — never toward a plausible fabrication
- [ ] **TRANS-08**: Visitor text cannot inject instructions into the translation prompt; the model translates rather than answers
- [ ] **TRANS-09**: A failed or rate-limited translation still renders the original message; never an empty bubble or an indefinite spinner
- [ ] **TRANS-10**: Rate-limit responses (429) are handled with backoff and a circuit breaker

### Admin — the owner's surface

- [x] **ADMIN-01**: Owner logs in with email and password, hashed with Argon2id, into a session held in a signed `HttpOnly` cookie (F18)
- [ ] **ADMIN-02**: The dashboard is usable on a phone and respects light/dark (F18)
- [x] **ADMIN-03**: Owner can read a conversation and send a reply
- [ ] **ADMIN-04**: Owner can toggle online/offline presence, which changes what new visitors experience (F14, F19)
- [ ] **ADMIN-05**: Inbox lists every conversation with faith decisions sorted to the top, then unanswered, then most recent (F19, F23)
- [ ] **ADMIN-06**: Inbox items show the anonymous label, visitor language, last-message preview in the owner's language, time, status, faith-decision flag, and push reachability (F20)
- [ ] **ADMIN-07**: Owner can filter by All / Decisions / New / In progress / Closed (F20)
- [ ] **ADMIN-08**: Owner can search across conversations (F20)
- [ ] **ADMIN-09**: Conversation view shows each message translated plus its original on demand (F21)
- [ ] **ADMIN-10**: Owner can set conversation status — New / In progress / Closed (F21)
- [ ] **ADMIN-11**: Owner can manually flag or unflag a conversation as a faith decision (F22)
- [ ] **ADMIN-12**: Overview shows counts of new conversations, decisions awaiting follow-up, and unanswered messages (F22)
- [ ] **ADMIN-13**: Conversation sidebar shows anonymous ID, language, entry point, push status, first-seen and last-seen — and no personal identity

### Safety, abuse, and operations

- [x] **OPS-01**: Message sending is rate-limited per visitor and per hashed IP; the IP is HMAC'd with a rotating salt and never stored raw
- [ ] **OPS-02**: Owner can block an abusive visitor from the dashboard
- [ ] **OPS-03**: Owner can permanently delete a conversation
- [ ] **OPS-04**: Localized crisis-line resources are reachable for each supported locale
- [ ] **OPS-05**: Admin login has lockout on repeated failure and sessions the owner can revoke
- [ ] **OPS-06**: Postgres data lives on a named volume, verified by a deliberate container restart
- [ ] **OPS-07**: Off-box backups run on a schedule, with one documented and executed restore drill
- [ ] **OPS-08**: VAPID keys are generated once off-box and backed up; they are never generated in a Dockerfile or startup script
- [ ] **OPS-09**: Pastoral message content never reaches container logs — parameterized writes and `log_statement=none`
- [ ] **OPS-10**: A health check endpoint reports app and database liveness
- [ ] **OPS-11**: Gate funnel is instrumented — gate shown → prompt shown → granted, split by platform — since no benchmark exists for push as a hard prerequisite

### Foundation

- [ ] **FOUND-01**: A translation spike benchmarks the candidate OVH models on Arabic and Swahili with faith/scriptural reference text and a prompt-injection set, and produces a go/no-go on the final language list
- [x] **FOUND-02**: Realtime delivery uses one dedicated Postgres listener plus a bounded pool — connection count is fixed, not proportional to visitor count
- [x] **FOUND-03**: The schema carries a `responders` table and nullable assignment columns from day one, so a second responder is additive rather than a migration
- [x] **FOUND-04**: The app builds and deploys as a single container on Coolify with migrations applied at start

---

## v2 — Deferred

- Inbox saved views beyond the v1 filter set
- Faith-content translation glossary and human review queue — the "show original" safeguard covers v1; revisit after seeing real mistranslations
- Second translation provider as failover, or per-language provider routing
- Push re-subscription recovery flow for visitors who lost their subscription
- Second responder: assignment, routing, and the UI for it (schema is ready in v1)
- Voice notes
- TOTP on admin login

---

## Out of Scope

- **AI or auto-reply authoring, including suggested replies** — a single AI-authored reply retroactively poisons trust in every real one. Translation carries the human's words; it never generates them.
- **Canned responses and macros** — same reason at lower intensity; the product's promise is that a person wrote this.
- **Typing indicators** — the responder is deliberately not always online; dots that start and stop read as "he began answering me and gave up."
- **Read receipts** — "Seen" with no reply manufactures rejection out of ordinary human latency.
- **Visitor login, accounts, or any personal contact collection** — anonymity is the feature, not a limitation.
- **Pre-chat forms, offline email capture, queue positions, satisfaction ratings, auto-close** — ticket-system furniture that contradicts "the chat is the whole product."
- **Automated content moderation** — high false-positive risk on exactly the faith and crisis language this product exists to receive. Rate limit plus owner block covers v1.
- **Automatic faith-decision detection** — a pastoral judgment, not a classifier's.
- **Public content library, blog, or media pages** — no pages exist by design.
- **Analytics dashboards beyond the at-a-glance counts and the gate funnel** — not what this is for.
- **Email or SMS push fallback** — would require personal contact info, which is excluded.
- **File upload, message editing, transcript export, in-page notification sounds** — surface area without a v1 purpose.
- **Automatic retention purging** — conversations are relationships, not tickets; a visitor may return in a year. Manual delete is available.

---

## Traceability

| PRD | Requirement |
|-----|-------------|
| F1 | CHAT-01 |
| F2 | CHAT-09 |
| F3 | ID-01 |
| F4 | LANG-01, LANG-02 |
| F5 | LANG-03 |
| F6 | LANG-06 |
| F7 | LANG-07 |
| F8 | PUSH-01 |
| F9 | PUSH-03 |
| F10 | CHAT-08 |
| F11 | TRANS-01, TRANS-04 |
| F12 | TRANS-02, TRANS-03, TRANS-04 |
| F13 | CHAT-02 |
| F14 | ADMIN-04 |
| F15 | CHAT-04, CHAT-05 |
| F16 | CHAT-06 |
| F17 | PUSH-06 |
| F18 | ADMIN-01, ADMIN-02 |
| F19 | ADMIN-04, ADMIN-05 |
| F20 | ADMIN-06, ADMIN-07, ADMIN-08 |
| F21 | ADMIN-09, ADMIN-10 |
| F22 | ADMIN-11, ADMIN-12 |
| F23 | ADMIN-05 |

All 23 PRD functional requirements are covered.

### Phase mapping

Every v1 requirement maps to exactly one phase. **71/71 mapped - no orphans, no duplicates.**

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAT-01 | Phase 1 | Pending |
| CHAT-02 | Phase 1 | Pending |
| CHAT-03 | Phase 1 | Pending |
| CHAT-04 | Phase 1 | Pending |
| CHAT-05 | Phase 1 | Pending |
| CHAT-06 | Phase 1 | Pending |
| CHAT-07 | Phase 1 | Pending |
| CHAT-08 | Phase 1 | Pending |
| CHAT-09 | Phase 1 | Pending |
| ID-01 | Phase 1 | Pending |
| ID-02 | Phase 1 | Pending |
| ID-03 | Phase 2 | Pending |
| ID-04 | Phase 2 | Pending |
| ID-05 | Phase 1 | Pending |
| LANG-01 | Phase 1 | Pending |
| LANG-02 | Phase 1 | Pending |
| LANG-03 | Phase 1 | Pending |
| LANG-04 | Phase 1 | Pending |
| LANG-05 | Phase 1 | Pending |
| LANG-06 | Phase 1 | Pending |
| LANG-07 | Phase 1 | Pending |
| PUSH-01 | Phase 2 | Pending |
| PUSH-02 | Phase 2 | Pending |
| PUSH-03 | Phase 2 | Pending |
| PUSH-04 | Phase 2 | Pending |
| PUSH-05 | Phase 2 | Pending |
| PUSH-06 | Phase 2 | Pending |
| PUSH-07 | Phase 2 | Pending |
| PUSH-08 | Phase 2 | Pending |
| PUSH-09 | Phase 2 | Pending |
| PUSH-10 | Phase 2 | Pending |
| PUSH-11 | Phase 2 | Pending |
| PUSH-12 | Phase 2 | Pending |
| TRANS-01 | Phase 2 | Pending |
| TRANS-02 | Phase 2 | Pending |
| TRANS-03 | Phase 2 | Pending |
| TRANS-04 | Phase 2 | Pending |
| TRANS-05 | Phase 2 | Pending |
| TRANS-06 | Phase 2 | Pending |
| TRANS-07 | Phase 2 | Pending |
| TRANS-08 | Phase 2 | Pending |
| TRANS-09 | Phase 2 | Pending |
| TRANS-10 | Phase 2 | Pending |
| ADMIN-01 | Phase 1 | Pending |
| ADMIN-02 | Phase 3 | Pending |
| ADMIN-03 | Phase 1 | Pending |
| ADMIN-04 | Phase 3 | Pending |
| ADMIN-05 | Phase 3 | Pending |
| ADMIN-06 | Phase 3 | Pending |
| ADMIN-07 | Phase 3 | Pending |
| ADMIN-08 | Phase 3 | Pending |
| ADMIN-09 | Phase 2 | Pending |
| ADMIN-10 | Phase 3 | Pending |
| ADMIN-11 | Phase 3 | Pending |
| ADMIN-12 | Phase 3 | Pending |
| ADMIN-13 | Phase 3 | Pending |
| OPS-01 | Phase 1 | Pending |
| OPS-02 | Phase 3 | Pending |
| OPS-03 | Phase 3 | Pending |
| OPS-04 | Phase 3 | Pending |
| OPS-05 | Phase 3 | Pending |
| OPS-06 | Phase 1 | Pending |
| OPS-07 | Phase 3 | Pending |
| OPS-08 | Phase 3 | Pending |
| OPS-09 | Phase 1 | Pending |
| OPS-10 | Phase 3 | Pending |
| OPS-11 | Phase 2 | Pending |
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |

**Totals:** Phase 1 - 28 | Phase 2 - 26 | Phase 3 - 17 | **Total 71**

**Mapping notes** (where a requirement spans a phase boundary and a single-phase call was made):

- **ADMIN-01 / ADMIN-03 -> Phase 1.** A minimal owner login and reply surface is Phase 1 scope. Without it the realtime spine cannot be exercised end to end until Phase 3. ADMIN-02 (the dashboard being genuinely phone-usable and light/dark aware) stays in Phase 3 with the full owner surface.
- **ADMIN-09 -> Phase 2.** "Translated plus original on demand" is the owner-side half of the show-original safeguard shipped with the translation worker; splitting it from TRANS-04 would duplicate the same work across two phases.
- **ADMIN-04 -> Phase 3.** Phase 1 delivers the presence *read* path only - the welcome tells the visitor the truth. The owner-facing toggle and its state indicator land with the dashboard.
- **LANG-05 -> Phase 1.** The mirror-by-allowlist rule is part of the direction system built alongside LANG-03/LANG-04. Phase 3 re-audits it against the admin surface but does not own the requirement.
- **OPS-07 -> Phase 3.** The scheduled off-box `pg_dump` is wired in Phase 1 as enabling work for OPS-06, but the requirement text demands a *documented and executed* restore drill, which only closes in the ship phase.
- **OPS-08 -> Phase 3.** Phase 2 develops against development VAPID keys; the one-time off-box generation and backup of the production keys is a ship-phase act, since key loss is the only unrecoverable event in the system.
- **OPS-11 -> Phase 2.** The gate funnel is instrumented against the *real* gate. Phase 1's `<Gate>` is a shell behind an env bypass flag and would produce meaningless funnel data.
- **FOUND-04 -> Phase 1.** The first Coolify deploy happens in Phase 1 so Traefik's long-lived-SSE behaviour is discovered empirically rather than at ship time. Phase 3's "production deploy" is the go-live cutover, covered by OPS-07/OPS-08/OPS-10.
