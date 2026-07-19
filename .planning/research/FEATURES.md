# Feature Research

**Domain:** Anonymous, chat-first, one-on-one human support (pastoral / gospel-sharing), single-operator inbox, multilingual
**Researched:** 2026-07-20
**Confidence:** MEDIUM

## Orientation

Three product families were surveyed, and they pull in different directions:

1. **Sales/support live chat widgets** (Intercom, Crisp, Tawk.to, LiveChat, Freshchat, HelpCrunch, Chatra) — optimized for lead capture and ticket throughput. Most of their feature set is *actively wrong* here.
2. **Anonymous crisis/helpline chat** (Crisis Text Line, 7 Cups, Samaritans / Hey Sam, 988 Lifeline, ThroughLine) — optimized for lowering the disclosure threshold for a vulnerable person. This is the closest analogue and the primary reference.
3. **Consumer messengers** (WhatsApp, Messenger, Google Chat) — where the *interaction grammar* comes from: bubbles, thread persistence, translation disclosure, push.

The governing insight from family 2 is that **anonymity is the product, not a limitation** — the text medium is chosen precisely because it lowers the barrier for someone who would never phone or sign up. The governing insight from family 1's failure mode is that the standard widget chrome (typing dots, read receipts, CSAT stars, canned replies, offline forms) is built for a synchronous, transactional, multi-agent world this product deliberately does not inhabit.

Everything below is judged against three PROJECT.md principles:
- **P1 — The chat is the whole product.** Anything that is not the conversation competes with it.
- **P2 — A real human always.** Nothing may author, imply, or simulate the owner's words.
- **P3 — Reachability is the second goal.** An unreachable visitor is a lost person.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Full-screen thread with bubbles, own-vs-other alignment, timestamps | Universal messenger grammar; anything else reads as a form, not a conversation | LOW | Single stylesheet must serve LTR+RTL via CSS logical properties. Timestamps should be relative and coarse ("yesterday"), not clock-precise — precision invites response-time scorekeeping |
| Persistent history restored on return | A conversation that forgets is a ticket, not a relationship | MEDIUM | Keyed to the random browser ID. Restore language + appearance in the same fetch to avoid a theme flash |
| Optimistic send (message appears instantly, reconciles after) | Perceived latency is the single loudest quality signal in chat | LOW | Needs a per-message client-side state: pending → stored. Failure must be visible and retryable, never silent |
| Delivery certainty ("saved" / "sent") | Anonymous users have no other proof their words landed. Absent this, they re-send or leave | LOW | Deliberately *one* state, not a WhatsApp-style tick ladder — see anti-features on read receipts |
| Explicit "you are talking to a real person" statement | ~83% of users prefer a human; disclosure research shows undisclosed-bot suspicion poisons trust even when the responder *is* human. In 2026 the default assumption on any chat box is "bot" | LOW | Must be in the welcome message, in the visitor's language, in the owner's voice. This is a trust feature, not copy garnish |
| Auto-detected language with manual override, persisted | 10 locales, mobile arrivals; a visitor should never have to configure to be understood | MEDIUM | `navigator.languages` → supported-locale match → fallback English. Manual choice must win permanently over detection |
| Full RTL layout (Arabic) | Arabic is 1 of 10; a mirrored-but-broken layout signals the product was not built for them | MEDIUM | `<html dir>` + logical properties. Bubble tails, icons, and scroll affordances are the usual breakage points |
| Light/dark following system, manually overridable | Mobile-first; opened at night by someone in distress. Table stakes in 2026 | LOW | One of only two header controls — must be genuinely instant, no reload |
| Translation of both directions with original always retrievable | The visitor must be able to check that a strange sentence is a translation artifact, not the human's actual meaning. Critical when the subject is faith | HIGH | See "show original" pattern below |
| Push notification on owner reply, localized, deep-linking back into the thread | This is the *entire* return path. Anonymous + no email = push or nothing | MEDIUM | Payload must not leak message content on a lock screen — a faith conversation is sensitive. Title/body should be generic and localized ("You have a new reply") |
| Owner inbox: one list, newest/unanswered surfaced, open → read → reply | The minimum viable operator surface | MEDIUM | Must work well on a phone — the owner will answer from a pocket, not a desk |
| Owner push/notification when a new message arrives | The owner is one person, not on-call. Without this, response times are governed by whenever he happens to check | MEDIUM | Same web-push infrastructure as the visitor side; build once, use twice |
| Rate limiting per anonymous ID and per IP | Frictionless anonymous entry with no floor is an abuse invitation | LOW | Reject with a gentle localized message in-thread, not an HTTP error page |
| Owner block + manual conversation delete | The only moderation levers available given the deliberate absence of automated filtering | LOW | Block should be silent to the blocked visitor (no "you have been blocked" — that is an engagement hook for a griefer) |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Zero-chrome entry — URL *is* the chat** | Every competitor makes you find and click a bubble on a marketing page. Baymard finds floating chat widgets are disruptive and obstruct content. Here there is no content to obstruct because there is no page. Time-to-first-message approaches zero | LOW | The differentiator is subtraction. Guard it: any future "just one banner" request is a regression |
| **Exactly two header controls (language, appearance)** | Forces the interface to disappear. Both controls are *identity* controls — "be understood, be comfortable" — not navigation | LOW | No hamburger, no settings, no "powered by". If a third control is ever proposed, something else must leave |
| **Per-message "show original" disclosure** | Google Chat's pattern (translated text primary, original one tap away beneath the bubble) is the proven shape. Applied to a faith conversation it becomes a *safeguard*: the visitor can always verify the human's actual words | MEDIUM | Collapsed by default. Never side-by-side — that doubles scroll and turns every bubble into a diff view. Show original for *both* sides' messages |
| **Owner-side translation preview before send** | The owner writes in his language, sees the outgoing translation, and can rephrase before it goes. No competitor does this because no competitor's every word carries theological weight | MEDIUM | Requires a translate-then-confirm step in the reply box. Must be fast enough not to break reply flow; cache aggressively. Needs a "send anyway / send original" escape when translation fails or times out |
| **Faith-decision flag with priority sort** | Domain-specific triage no generic tool has. It converts the inbox from chronological to *pastoral* — the person who just took a step of faith is never buried under newer noise | LOW | Manual flag only (see anti-features re: auto-detection). Sort key: flagged-and-unanswered > unanswered > recent |
| **Honest presence: owner online/offline changes what the visitor is told** | The 57%-leave / 8.2%-fill-a-form data shows the offline *form* is a cliff. Replacing it with a truthful, warm, in-thread line from the human — and a push that genuinely arrives — converts "nobody's here" from a dead end into a promise that is actually kept | MEDIUM | The offline state must be a message *in the thread*, in the owner's voice, not a banner or a modal. Set an honest expectation window without a countdown |
| **Guided iOS install → push flow** | iOS Push API is Home-Screen-web-app-only; a naive hard gate silently loses every iPhone visitor. A guided Share → Add to Home Screen screen recovers a majority-mobile audience | HIGH | Detect iOS + non-standalone. Must be illustrated (the Share glyph), localized, and RTL-correct. This is the highest-risk conversion surface in the product |
| **Two-step push gate with a warm re-ask** | The native prompt fires once, ever; a dismissal is unrecoverable. A custom pre-prompt keeps the re-ask possible and lets the *reason* be stated in the visitor's language and the owner's voice | MEDIUM | Native `Notification.requestPermission()` must fire inside the click handler of the custom prompt (mandatory on iOS, best practice everywhere) |
| **Indefinite retention framed as relationship** | Support tools purge on a retention schedule. Here, a visitor returning in a year finds the conversation intact — because no personal data was ever stored, the usual retention risk does not apply | LOW | Consequence, not a build task: no TTL job, no auto-close, no archive-after-30-days |
| **EU (Gravelines) inference residency for translation** | Confidential pastoral conversations never leave the EU. A genuine trust claim most chat tools cannot make | LOW | Stack-level, from OVHcloud choice. Worth stating in the privacy copy the visitor can reach |

### Anti-Features (Commonly Requested, Often Problematic)

Every item below ships in most competitors. Each is argued from P1/P2/P3, not from taste.

| Feature | Why Requested | Why Problematic *here* | Alternative |
|---------|---------------|------------------------|-------------|
| **Chatbot / AI auto-reply / AI suggested replies** | "Cover the hours he's asleep." Universal in 2026 | Violates P2 outright. Disclosure research shows suspicion of a bot degrades trust *even when a human is present* — one AI reply retroactively casts doubt on every real one. In a faith conversation, a machine authoring belief claims is a category error, and crisis-support literature explicitly warns against generative AI in this exact seat | Honest offline message + push that actually reaches them. Translation is the *only* permitted machine touch, and it carries words it did not author |
| **Canned responses / snippets / macros** | Saves the solo operator typing on repeated questions | The perceived value of this product is that a specific human is speaking to *you*. A visitor who ever recognizes a stock sentence — or receives one they can tell was pre-written — loses the one thing they came for. At one operator with low volume, the time saved is trivial against the trust risk | Let the owner scroll his own past conversations if he wants to reuse a phrasing — retyping is the feature, not the cost |
| **Typing indicator** | "It feels alive." Table stakes in every messenger | Research links typing bubbles to measurable communication anxiety — they give enough signal to obsess over and not enough to interpret. Worse, this owner is *not always online*: dots that appear and stop read as "he started to answer me and gave up," which is devastating in this context. It also promises synchrony the product cannot guarantee | Nothing on the visitor side. The presence state already answers "is someone there?" honestly |
| **Read receipts / "seen"** | Expected from WhatsApp | ~35% report feeling ignored when a message shows read-but-unanswered. Here that means: an anonymous person who just disclosed something enormous watches "Seen" sit there while a one-person responder eats dinner. It manufactures rejection out of ordinary human latency | Single "saved/sent" delivery state only — proof it arrived, no claim about attention |
| **Satisfaction rating / CSAT / thumbs / "was this helpful?"** | Standard support close-out | Converts a pastoral conversation into a serviced ticket at exactly its most vulnerable moment. It also implies the conversation is *over*, which contradicts indefinite retention and follow-up | No rating, ever. The success signal is the faith-decision flag and the fact that they came back |
| **Offline contact form ("leave your email")** | The default offline behavior of every widget | Directly violates the anonymity guarantee, and the data says only ~8.2% fill it in anyway. Collecting an email would make the product a different product | Push registration already happened at the gate — the return path exists without asking for anything |
| **Pre-chat form (name / topic / department)** | Helps the operator triage | Every field is friction between a hesitant person and the first sentence they were brave enough to type. Anonymity is the feature; asking for a name is asking them to stop being anonymous | Straight into the thread. The owner learns what he needs by asking, in conversation, like a person |
| **Queue position / "you are #3" / estimated wait countdown** | Reduces uncertainty in call centres | This is one human, not a queue — a number would be a fabrication. A live countdown that expires without a reply is worse than no number, and it frames the visitor as a unit of throughput | Honest, non-numeric expectation in the owner's voice; push carries the actual resolution |
| **Auto-close / auto-archive after N days of silence** | Keeps inboxes tidy | These are relationships. A visitor may return in a year (PROJECT.md). Auto-close would either delete that history or greet a returning person with "this conversation was closed" | Manual status only; unanswered items sort up and stay up |
| **Automated content moderation / profanity filter** | Standard safety hygiene | High false-positive rate on exactly this product's vocabulary — faith language, crisis language, self-harm disclosure, and scripture quotation all trip generic filters. Silencing a person in crisis because a classifier flagged them is the worst possible failure | Rate limit + owner block. Human judgement at N=1 volume |
| **Automatic faith-decision detection (keyword or AI)** | "The flag could set itself" | A false positive puts a browsing skeptic at the top of the pastoral queue; a false negative buries a real decision. Both are worse than a click. Also drags an AI classifier into a P2-protected judgement | Manual flag, one tap, in the conversation view |
| **Analytics dashboards, charts, response-time SLAs, agent scorecards** | Every support tool leads with them | Optimizing a measured response time turns a pastor into an agent. At one operator the only numbers that change behaviour are "how many are waiting" and "how many decisions are unanswered" | At-a-glance counts only, on the inbox itself, no separate screen |
| **Multi-agent routing, assignment, collision detection, internal notes, @mentions, tags, permissions, kanban pipelines** | Every shared-inbox tool ships them | Documented bloat at N=1 — team platforms impose ticketing workflows and layered permissions a one-person operation never touches, at real cost in money and attention | Ship none. Keep the *schema* multi-responder-ready (nullable `responder_id`) so v2 is not a rewrite — build zero UI for it |
| **Email/SMS notification fallback when push fails** | "Push is unreliable, have a backup" | Requires an email or phone number — the exact data the product refuses to hold. There is no backup channel that preserves anonymity | Invest in making push work: guided iOS install, warm re-ask, clear recovery copy if permission was previously denied |
| **Floating chat bubble / widget mode / embeddable snippet** | "Put it on other sites too" | Baymard: floating widgets are disruptive and obstruct content. More importantly it inverts P1 — the chat becomes an accessory to a page instead of being the page | The URL is the artifact. Share the link; it opens full-screen |
| **Visitor-side file/image upload** | Expected in messengers | Storage, moderation, and CSAM exposure on a fully anonymous, unauthenticated endpoint — a severe liability for a one-person operator with no moderation stack | Text only in v1. Revisit only with a real moderation answer |
| **Message editing / unsend / delete-for-everyone** | Messenger habit | Encourages second-guessing a disclosure that took courage to make, and lets an abuser erase evidence before the owner sees it | Not offered. The owner can delete an entire conversation |
| **Visitor-facing "chat history export" / transcript email** | Support convention | Requires an email address, and creates a portable artifact of a conversation that may be dangerous to possess in some of the 10 language regions | History persists in the browser; nothing leaves it |
| **Sound effects / notification chimes in-page** | Liveliness | Opened at 2am, in a shared room, in a country where this conversation carries risk. Audio is a safety problem, not a delight | Silent. Push handles absence; presence handles attention |

## Feature Dependencies

```
Push gate (hard block)
    └──requires──> Service worker + VAPID subscription
    └──requires──> Anonymous browser ID  ──requires──> nothing (client-generated)
    └──on iOS requires──> Guided Add-to-Home-Screen screen
                              └──requires──> Web app manifest + standalone detection
    └──requires──> Localized gate + re-ask copy
                        └──requires──> i18n string layer

Chat thread (visitor)
    └──requires──> Anonymous browser ID
    └──requires──> Push gate passed (hard block — thread is not reachable before)
    └──requires──> Language selection ──requires──> i18n string layer
    └──requires──> Message persistence

Translation (two-way)
    └──requires──> Language selection (visitor) + fixed owner language
    └──requires──> Translation provider + per-message cache + 429 backoff
    └──blocks────> Locale list finalization   [Swahili spike must resolve FIRST]

"Show original" disclosure ──enhances──> Translation
                           ──is the safeguard for──> absent faith glossary

Owner reply ──requires──> Translation preview ──requires──> Translation
            ──triggers──> Visitor push ──requires──> Push gate

Owner inbox
    └──requires──> Admin auth (bcrypt + session cookie)
    └──requires──> Message persistence
    └──requires──> Faith-decision flag  (drives priority sort)
    └──requires──> Presence toggle      (drives visitor offline copy)

Presence toggle ──determines──> Visitor welcome/offline message variant
Real-time delivery (SSE over Postgres NOTIFY) ──enhances──> Chat thread, Owner inbox
                                              ──does NOT gate──> anything (async is the floor)

RTL layout ──requires──> Language selection
           ──affects──> every visitor surface incl. iOS install guide

Rate limiting ──requires──> Anonymous browser ID + IP
Owner block   ──requires──> Anonymous browser ID + Admin auth
```

### Dependency Notes

- **Push gate blocks the chat thread:** this is a product decision, not a technical one, and it means the gate is the *first* screen a visitor ever sees. Its localized copy and iOS branch must therefore ship in the same phase as the thread — a half-built gate means a fully unreachable product.
- **Guided iOS install precedes the permission prompt:** on iOS the Push API only exists inside a Home Screen web app, and `requestPermission()` must be called from a click handler. There is no way to prompt first and install later. This inverts the flow order for roughly the majority of expected traffic.
- **Swahili spike blocks locale finalization:** no surveyed OVH model documents Swahili. Everything localized — gate copy, welcome, system messages, install guide — is written against the final language list, so the spike must precede the locale files.
- **Translation preview sits inside the reply path:** it is not a separate feature but a modification of the owner's send action, so it must be designed with the reply box, not bolted on after.
- **Real-time (SSE) enhances but never gates:** the product must be fully correct with pure polling/refresh. Async delivery is the floor; SSE is a latency improvement. Building it as a hard dependency would make an infrastructure hiccup a total outage.
- **Presence toggle conflicts with any wait estimate:** the toggle deliberately carries *state*, not *time*. Adding a countdown or ETA re-introduces the queue-counter anti-feature through the back door.
- **Read receipts conflict with the "saved/sent" state:** implementing both invites the tick-ladder. Pick the single delivery state and never extend it.

## MVP Definition

### Launch With (v1)

- [ ] Anonymous browser ID + conversation persistence — everything else is keyed to it
- [ ] Two-step push gate with localized warm re-ask, hard block on the chat — this *is* the reachability guarantee (P3)
- [ ] Guided iOS Add-to-Home-Screen flow — without it the majority-mobile iPhone audience is silently lost
- [ ] Full-screen thread: bubbles, optimistic send, single delivery state, restored history
- [ ] Two header controls only: language picker, light/dark toggle
- [ ] 10-locale i18n (pending spike) with auto-detect, override, persistence, and full RTL
- [ ] Warm welcome message in the owner's voice, in the visitor's language, stating plainly that a real person answers
- [ ] Two-way translation with collapsed per-message "show original" on both sides
- [ ] Owner reply with translation preview before send, plus a send-anyway escape
- [ ] Presence toggle driving an honest in-thread offline message (no form, no counter)
- [ ] Push to visitor on owner reply, generic localized payload, deep-link into thread
- [ ] Push/notify to owner on new visitor message
- [ ] Admin auth + single mobile-friendly inbox, priority sort, manual faith-decision flag, at-a-glance counts
- [ ] Rate limiting, owner block, manual conversation delete

### Add After Validation (v1.x)

- [ ] SSE real-time delivery — trigger: replies feel stale in real use, or the owner reports refreshing
- [ ] Inbox filters (All / Decisions / New / In progress / Closed) and search — trigger: conversation count exceeds one comfortable scroll (~40–60)
- [ ] Faith-content translation glossary / term pinning — trigger: first observed mistranslation of a doctrinal term that "show original" did not adequately catch
- [ ] Second translation provider for a specific language — trigger: Swahili (or another) quality proves unacceptable in production
- [ ] Owner-side quick language filter on the inbox — trigger: the owner is context-switching across locales enough to make mistakes
- [ ] Push re-subscription recovery flow for visitors whose subscription silently expired — trigger: first observed dead-subscription reply

### Future Consideration (v2+)

- [ ] Second responder + assignment — defer: PROJECT.md scopes v1 to one responder; keep the schema open, build no UI
- [ ] Voice notes — defer: storage, moderation, transcription-for-translation, and a much larger anonymity surface
- [ ] Scheduled/queued replies ("send at 8am their time") — defer: solves a problem the owner has not proven to have, and edges toward automation of a human voice
- [ ] Cross-device continuity via a shareable resume link — defer: reintroduces an identifier that can be intercepted; the current identity limits are explicitly accepted

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Anonymous ID + persistence | HIGH | LOW | P1 |
| Two-step push gate + re-ask | HIGH | MEDIUM | P1 |
| Guided iOS install flow | HIGH | HIGH | P1 |
| Full-screen thread + optimistic send | HIGH | MEDIUM | P1 |
| i18n (10 locales) + RTL | HIGH | HIGH | P1 |
| Two-way translation | HIGH | HIGH | P1 |
| "Show original" disclosure | HIGH | MEDIUM | P1 |
| Owner translation preview before send | HIGH | MEDIUM | P1 |
| Light/dark toggle | MEDIUM | LOW | P1 |
| Honest offline message via presence toggle | HIGH | MEDIUM | P1 |
| Push to visitor on reply | HIGH | MEDIUM | P1 |
| Push/notify to owner on new message | HIGH | MEDIUM | P1 |
| Admin auth + inbox + priority sort | HIGH | MEDIUM | P1 |
| Manual faith-decision flag | HIGH | LOW | P1 |
| Rate limit + block + delete | MEDIUM | LOW | P1 |
| At-a-glance counts | MEDIUM | LOW | P1 |
| SSE real-time delivery | MEDIUM | MEDIUM | P2 |
| Inbox filters + search | MEDIUM | MEDIUM | P2 |
| Translation glossary | MEDIUM | MEDIUM | P2 |
| Push re-subscription recovery | MEDIUM | MEDIUM | P2 |
| Second responder | LOW (v1) | HIGH | P3 |
| Voice notes | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Intercom / Crisp / Tawk (sales chat) | Crisis Text Line / 7 Cups / Samaritans (crisis chat) | Our Approach |
|---------|--------------------------------------|------------------------------------------------------|--------------|
| Entry | Floating bubble on a marketing page | Dedicated page, often a form or SMS shortcode first | URL *is* the chat, full screen, zero chrome |
| Identity | Pre-chat form: name, email, topic | Anonymous or handle-only; some require signup (7 Cups) | Random browser ID only; nothing asked, ever |
| Who answers | Bot first, human on escalation | Trained human volunteer/counselor; AI use is contested and warned against | One human, always; stated explicitly in the welcome |
| Offline | Contact form ("leave your email") | Hours notice, or redirect to another channel/hotline | Honest in-thread message in the owner's voice + real push return path |
| Return path | Email transcript / follow-up | New session, usually no continuity | Browser push — the only channel that preserves anonymity |
| Typing/read state | Both, prominently | Varies; some suppress deliberately | Neither. Single "sent" state only |
| Close-out | CSAT rating, auto-close, transcript | Safety plan / resource handoff | No rating, no auto-close; conversation stays open indefinitely |
| Triage | Tags, routing, SLAs, pipelines | Risk-severity triage by trained staff | One manual flag: faith decision → sorts to top |
| Translation | Bot-side auto-translate, original usually hidden | Rarely offered; separate language lines instead | Two-way, both sides, original one tap away, owner previews before sending |
| Analytics | Full dashboards, agent scorecards | Aggregate outcome reporting | Three counts on the inbox. No dashboard |

## Sources

- NN/g — *The User Experience of Customer-Service Chat: 20 Guidelines* — https://www.nngroup.com/articles/chat-ux/ (MEDIUM)
- Baymard — *These Three (Popular) Approaches to Implementing 'Live Chat' are Often Highly Disruptive for Users* — https://baymard.com/blog/live-chat-usability-issues (MEDIUM)
- Apple Developer — *Sending web push notifications in web apps and browsers* — https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers (MEDIUM, corroborated)
- Notificare — *Web Push in iOS: Add to Home Screen* — https://notificare.com/blog/2024/09/16/web-push-in-ios-add-to-home-screen/ (MEDIUM)
- Pushpad — *iOS special requirements for web push notifications* — https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications (MEDIUM)
- Pushpad — *The double opt-in (prompt) for web push notifications* — https://pushpad.xyz/blog/the-double-opt-in-for-web-push-notifications (MEDIUM)
- OneSignal — *Investigating the Chrome UX Report: How to Boost Web Push Opt-In Rates* — https://onesignal.com/blog/boost-your-web-push-opt-in-rates/ (LOW — vendor)
- Google Chat Help — *Use Automatic Translation in Chat* — https://support.google.com/chat/answer/15711193 (MEDIUM)
- Ahmad Shadeed — *Building Real-life Components: Facebook Messenger's Chat Bubble* — https://ishadeed.com/article/facebook-messenger-chat-component/ (MEDIUM)
- JivoChat — *Offline Messages: How to Engage Customers When Agents Are Away* (57% leave / 8.2% form-fill figures) — https://www.jivochat.com/blog/communication/offline-messages.html (LOW — vendor-sourced statistics, directionally consistent with other vendors but not independently verified)
- Chatra — *Setting Customer Expectations* — https://chatra.com/books/guide-to-live-chat/06-setting-customer-expectations/ (LOW — vendor)
- LiveChat — *Asynchronous communication / messaging mode* — https://www.livechat.com/help/messaging-mode/ (MEDIUM)
- ChatSpark — *Alternative to LiveChat for solopreneurs* (single-operator bloat argument) — https://www.chatspark.dev/learn/alternative-to-livechat-for-solopreneurs (LOW — competitor marketing, but the specific bloat list matches independent tool feature sets)
- SSRC Just Tech — *When Help Isn't Fully Human: The Problem of Generative AI in Crisis Support* — https://just-tech.ssrc.org/articles/the-problem-of-generative-ai-in-crisis-support/ (MEDIUM)
- arXiv 2506.09354 — *"Is This Really a Human Peer Supporter?": Misalignments Between Peer Supporters and Experts in LLM-Supported Interactions* (MEDIUM)
- Wikipedia — *Crisis Text Line* (incl. EPIC data-sharing controversy) — https://en.wikipedia.org/wiki/Crisis_Text_Line (MEDIUM)
- Springer, *AI & SOCIETY* — *Understanding users' responses to disclosed vs. undisclosed customer service chatbots* — https://link.springer.com/article/10.1007/s00146-023-01818-7 (MEDIUM)
- PsychVarsity — *Digital Body Language: How Read Receipts and Typing Bubbles Fuel Anxiety* — https://www.psychvarsity.com/digital-body-language-how-read-receipts-and-typing-bubbles-fuel-anxiety (LOW)
- WebProNews — *Google Redesigns Messages Typing Indicator to Cut Texting Anxiety* — https://www.webpronews.com/google-redesigns-messages-typing-indicator-to-cut-texting-anxiety/ (LOW)

### Confidence caveats

- **HIGH-equivalent:** iOS Home-Screen-only Push API and click-handler-required permission call — stated in Apple's own documentation and corroborated by three independent push vendors.
- **MEDIUM:** double opt-in push pattern; Google Chat's translated-primary / original-on-toggle disclosure; single-operator feature bloat list; async-mode reframing.
- **LOW / directional only:** all specific percentages (57% leave, 8.2% form-fill, 20% abandonment reduction, 31% texting anxiety, 35% read-but-unanswered). These come from vendor blogs or popular-press summaries, not from primary studies. They are used here to establish *direction*, not to justify a threshold. Do not put any of these numbers in product copy or a business case without primary verification.
- **Gap:** no primary HCI study was located that directly measures typing indicators or read receipts inside anonymous crisis-support chat specifically. The anti-feature argument for those two rests on general messaging-anxiety findings plus this product's structural fact that the responder is not always online. That structural argument stands on its own.
- **Gap:** no data was found on push-gate conversion when push is a *hard* prerequisite rather than an optional upsell. This is genuinely unusual; the gate's conversion rate is an unknown that only launch will answer, and it deserves instrumentation (gate shown → prompt shown → granted, by platform) from day one.

---
*Feature research for: anonymous chat-first one-on-one human support, single operator, multilingual*
*Researched: 2026-07-20*
