# Architecture Research

**Domain:** Self-hosted anonymous 1:1 pastoral chat — SSE realtime, web push, two-way LLM translation
**Researched:** 2026-07-20
**Confidence:** MEDIUM-HIGH (structure HIGH — derived from locked constraints; library mechanics MEDIUM — curated docs, single-source; SSE reconnect semantics LOW-MEDIUM — web sources)

---

## Standard Architecture

### System Overview

One container. One Postgres. Everything below lives inside the single Next.js process except the DB and OVH.

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                              │
│  ┌────────────────────┐   ┌────────────────────┐  ┌───────────────┐  │
│  │ Visitor tab        │   │ Service Worker     │  │ Admin (owner) │  │
│  │ - EventSource(SSE) │   │ - push handler     │  │ - EventSource │  │
│  │ - fetch POST send  │   │ - clients.matchAll │  │ - fetch POST  │  │
│  │ - localStorage:    │   │ - notificationclick│  │ - session ck  │  │
│  │   lang, appearance │   │                    │  │               │  │
│  └─────────┬──────────┘   └─────────▲──────────┘  └───────┬───────┘  │
└────────────┼────────────────────────┼─────────────────────┼──────────┘
             │ httpOnly visitor cookie│ push (VAPID)        │
┌────────────┼────────────────────────┼─────────────────────┼──────────┐
│  TRAEFIK (Coolify)  — TLS, no buffering on /api/*/stream             │
└────────────┼────────────────────────┼─────────────────────┼──────────┘
             │                        │                     │
┌────────────▼────────────────────────┼─────────────────────▼──────────┐
│  NEXT.JS CONTAINER (single process, node runtime)                    │
│                                                                       │
│  ── EDGE OF THE APP: route handlers ───────────────────────────────  │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌─────────┐ │
│  │ /api/chat │ │ /api/chat │ │ /api/chat │ │/api/push │ │/api/    │ │
│  │ /stream   │ │ /messages │ │ /delivered│ │/subscribe│ │ admin/* │ │
│  │  (SSE)    │ │  (POST)   │ │  (POST)   │ │  (POST)  │ │         │ │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └────┬─────┘ └────┬────┘ │
│        │             │             │            │            │       │
│  ── SERVER CORE (src/server/**, `import 'server-only'`) ───────────  │
│  ┌─────▼──────────┐  ┌──▼──────────▼──┐  ┌──────▼───┐  ┌────▼─────┐ │
│  │ realtime/hub   │  │ repo/*         │  │ push/    │  │ auth/    │ │
│  │ Map<convId,    │◄─┤ messages       │  │ send     │  │ session  │ │
│  │   Set<stream>> │  │ conversations  │  │ cleanup  │  │ (jose)   │ │
│  └─────▲──────────┘  │ visitors       │  └──────▲───┘  │ bcrypt   │ │
│        │             └──┬─────────────┘         │      └──────────┘ │
│  ┌─────┴──────────┐     │      ┌────────────────┴──┐  ┌───────────┐ │
│  │ db/listener    │     │      │ jobs/ (setInterval│  │ i18n/     │ │
│  │ 1 dedicated    │     │      │  sweepers)        │  │ static    │ │
│  │ pg.Client      │     │      │  - translate      │  │ JSON      │ │
│  │ LISTEN chat,   │     │      │  - push-fanout    │  └───────────┘ │
│  │ LISTEN presence│     │      │  - retry/backoff  │                │
│  └─────▲──────────┘     │      └────────┬──────────┘                │
│        │            ┌───▼──────────┐    │  ┌──────────────────┐     │
│        │            │ db/pool      │    └─►│ translation/     │     │
│        │            │ pg.Pool max~10│      │ client + prompt  │     │
│        └────────────┴───┬──────────┘      └────────┬─────────┘     │
└────────────────────────┼─────────────────────────────┼─────────────┘
                         │                             │
              ┌──────────▼──────────┐      ┌───────────▼─────────────┐
              │ POSTGRES            │      │ OVHcloud AI Endpoints   │
              │ tables + NOTIFY     │      │ OpenAI-compatible chat   │
              │ (source of truth)   │      │ 400 rpm, 429 backoff     │
              └─────────────────────┘      └─────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| **db/pool** | All reads/writes. Short checkouts only. | `pg.Pool`, `max: 10` |
| **db/listener** | *One* long-lived `pg.Client` doing `LISTEN chat; LISTEN presence`. Parses payloads, calls `hub.publish()`. Owns its own reconnect loop. | module singleton, `pg.Client` |
| **realtime/hub** | In-process fan-out registry: `Map<conversationId, Set<Subscriber>>`. Knows nothing about SQL. | plain Map + Set |
| **/api/chat/stream** | Holds an SSE `ReadableStream`. Backfills from DB using `Last-Event-ID`, then subscribes to hub. Holds **zero** DB connections while open. | route handler, `runtime='nodejs'`, `dynamic='force-dynamic'` |
| **repo/** | Every SQL statement in the app. Transactions that write a message also `pg_notify` in the same txn. | typed functions over pool |
| **translation/** | OVH client, prompt builder, 429 backoff, model-id from config. Pure — no DB knowledge. | OpenAI SDK w/ baseURL |
| **jobs/** | In-process interval sweepers claiming rows via `FOR UPDATE SKIP LOCKED`. Translation worker + push-fanout worker. | `setInterval` in an instrumentation hook |
| **push/** | `web-push` send + status-code-driven subscription lifecycle. | `web-push` |
| **auth/** | bcrypt verify, `jose`-signed httpOnly session cookie carrying `responder_id`. | bcrypt + jose |
| **i18n/** | Static JSON per locale, `dir` lookup, server-side `<html lang dir>`. No LLM involvement. | JSON + small helper |
| **Service Worker** | Receives push, decides whether to surface it, focuses/opens the conversation. | plain SW file at `/sw.js` |

**Hard boundary rule:** `src/server/**` must begin with `import 'server-only'`. Route handlers and server components may import it; client components may not. This is the only module boundary the codebase needs.

---

## Recommended Project Structure

```
src/
├── app/
│   ├── layout.tsx                     # reads lang+appearance cookies -> <html lang dir class>
│   ├── page.tsx                       # THE chat. Only public page. No other public routes.
│   ├── admin/
│   │   ├── login/page.tsx
│   │   └── (auth)/                    # layout guards session cookie
│   │       ├── page.tsx               # inbox
│   │       └── c/[id]/page.tsx        # conversation view
│   └── api/
│       ├── chat/
│       │   ├── stream/route.ts        # SSE — visitor
│       │   ├── messages/route.ts      # POST visitor send
│       │   ├── delivered/route.ts     # POST ack (gates push)
│       │   └── prefs/route.ts         # PATCH language/appearance
│       ├── push/
│       │   └── subscribe/route.ts     # POST/DELETE subscription
│       └── admin/
│           ├── login/route.ts
│           ├── stream/route.ts        # SSE — owner (all conversations)
│           ├── messages/route.ts      # POST reply (translation already attached)
│           ├── translate/route.ts     # POST draft -> preview translation
│           ├── presence/route.ts      # PATCH is_online
│           └── conversations/[id]/route.ts  # PATCH status/flag, DELETE
├── server/
│   ├── db/
│   │   ├── pool.ts                    # pg.Pool singleton
│   │   ├── listener.ts                # dedicated pg.Client + reconnect
│   │   └── migrations/000N_*.sql      # plain SQL, applied on boot
│   ├── realtime/
│   │   ├── hub.ts                     # subscribe/unsubscribe/publish
│   │   └── sse.ts                     # formatEvent(), heartbeat, headers
│   ├── repo/{visitors,conversations,messages,translations,push,ratelimit}.ts
│   ├── translation/{client.ts,prompt.ts,models.ts}
│   ├── push/{send.ts,lifecycle.ts}
│   ├── auth/{session.ts,password.ts,guard.ts}
│   └── jobs/{translate-worker.ts,push-worker.ts,index.ts}
├── lib/i18n/
│   ├── locales/{ar,en,es,fr,pt,hi,zh,ru,id,sw}.json
│   └── {detect.ts,dir.ts,t.ts}
├── components/{chat,admin,gate}/…
└── instrumentation.ts                 # boots listener + job loops once
public/
├── sw.js
└── manifest.webmanifest
```

### Structure Rationale

- **`app/` is thin.** Route handlers parse, authorize, call `repo`/`hub`, format. No SQL, no `fetch` to OVH. This is what makes the second responder a schema change and not a rewrite.
- **`server/` mirrors the runtime concerns**, not the domain nouns. `db`, `realtime`, `push`, `translation` are the four things that can independently fail; each owns its own failure handling.
- **`jobs/` is separate from `api/`** because translation and push must not run inside a request lifecycle. Next.js may terminate a handler's async work after the response is sent; a `setInterval` worker started from `instrumentation.ts` does not have that problem.
- **`lib/i18n/` is client-safe** (no `server-only`) — the picker needs the locale JSON in the browser.

---

## Data Model

All tables below are the concrete v1 proposal. `bigint … generated always as identity` throughout; `timestamptz` everywhere; no nullable booleans (use nullable timestamps — they carry *when*, which the dashboard wants anyway).

### `responders` — the expandability seam (see §Pattern 5)

```sql
create table responders (
  id                smallint primary key generated always as identity,
  email             text not null unique,          -- store lowercased
  password_hash     text not null,                 -- bcrypt
  display_name      text not null,
  language          text not null default 'en',    -- translation TARGET for visitor msgs
  is_online         boolean not null default false,
  online_changed_at timestamptz,
  role              text not null default 'owner', -- 'owner' | 'responder'
  created_at        timestamptz not null default now()
);
```

Seeded with exactly one row. **The owner's language and online state live here, not in env vars or a singleton `settings` table.** That single decision is 80% of the multi-responder seam.

### `visitors`

```sql
create table visitors (
  id            uuid primary key default gen_random_uuid(),  -- SERVER-generated
  language      text not null default 'en',
  appearance    text not null default 'system',              -- light|dark|system
  locale_hint   text,                                        -- raw navigator.language
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  blocked_at    timestamptz,
  push_lost_at  timestamptz,        -- set when last subscription 410'd; re-ask on return
  ip_hash       bytea               -- HMAC(secret, ip). Never the raw IP.
);
create index visitors_last_seen_idx on visitors (last_seen_at desc);
create index visitors_blocked_idx   on visitors (id) where blocked_at is not null;
```

**Two non-obvious calls:**

1. **The anonymous ID is server-generated and delivered as an httpOnly, `SameSite=Lax`, 10-year cookie — not a client-generated value in `localStorage`.** A client-supplied ID is a bearer token the client controls; anyone who guesses or steals one reads a pastoral conversation. httpOnly removes XSS exfiltration. `localStorage` still holds *language* and *appearance* (needed pre-hydration, non-sensitive). This satisfies "random anonymous ID stored in the browser" — a cookie is in the browser.
2. **`ip_hash` not `ip`.** An IP is personal data under GDPR and this project's hard constraint is *no personal data*. `HMAC-SHA256(server_secret, ip)` gives per-IP rate limiting with no reversible identifier. Rotate the secret periodically; buckets simply reset.

### `conversations`

```sql
create table conversations (
  id                        bigint primary key generated always as identity,
  visitor_id                uuid not null references visitors(id) on delete cascade,
  status                    text not null default 'new'
                            check (status in ('new','in_progress','closed')),
  faith_decision_at         timestamptz,          -- NULL = not flagged
  entry_point               text,                 -- ?src= from the linking app
  assigned_responder_id     smallint references responders(id),   -- NULLABLE, unused in v1
  last_message_at           timestamptz not null default now(),
  last_visitor_message_at   timestamptz,
  last_responder_message_at timestamptz,
  created_at                timestamptz not null default now()
);

create unique index conversations_one_open_per_visitor
  on conversations (visitor_id) where status <> 'closed';

create index conversations_inbox_idx on conversations (status, last_message_at desc);

create index conversations_priority_idx on conversations
  (faith_decision_at desc nulls last, last_visitor_message_at desc nulls last)
  where status <> 'closed';
```

The three denormalized `last_*_at` columns exist so the inbox — the dashboard's hot path — sorts and computes "unanswered" without touching `messages`:

```sql
-- unanswered
last_visitor_message_at > coalesce(last_responder_message_at, '-infinity')
```

The partial unique index enforces the product rule "a returning visitor lands back in *their* conversation" at the database level rather than in application logic.

### `messages`

```sql
create table messages (
  id              bigint primary key generated always as identity,
  conversation_id bigint not null references conversations(id) on delete cascade,
  author_side     text not null check (author_side in ('visitor','responder','system')),
  responder_id    smallint references responders(id),   -- NULL unless author_side='responder'
  client_msg_id   uuid,                                  -- client-generated, idempotency
  body            text not null,                         -- ALWAYS the author's original words
  source_lang     text not null,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz,   -- visitor's tab rendered it (gates push)
  read_at         timestamptz
);

create index messages_stream_idx on messages (conversation_id, id);
create unique index messages_idempotency_idx
  on messages (conversation_id, client_msg_id) where client_msg_id is not null;
create index messages_undelivered_idx on messages (id)
  where author_side = 'responder' and delivered_at is null;
```

`body` is **never** overwritten by a translation. That single invariant is what makes "the original must still be visible" structurally true rather than a UI promise.

`messages.id` doubles as the **SSE event id** — see §Pattern 3.

`client_msg_id` + partial unique index gives free idempotency: the visitor's optimistic send can retry on flaky mobile without duplicating.

### `message_translations` — **separate table, and here is the argument**

```sql
create table message_translations (
  message_id      bigint not null references messages(id) on delete cascade,
  target_lang     text not null,
  status          text not null default 'pending'
                  check (status in ('pending','ready','failed','skipped')),
  body            text,          -- NULL until ready
  model           text,          -- e.g. 'Qwen3.5-397B-A17B' — pinned id, recorded per row
  attempts        smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (message_id, target_lang)
);

create index message_translations_queue_idx
  on message_translations (next_attempt_at)
  where status = 'pending';
```

**Why not columns on `messages` (`translated_body`, `translated_lang`, `translation_status`)?**

The columns-on-messages design is genuinely simpler and it works — *for exactly one target language, forever*. Four things break it:

1. **"Nothing is translated twice" is a cache requirement, and `(message_id, target_lang)` as a primary key IS the cache.** With columns, dedupe becomes "check if `translated_body IS NOT NULL` AND `translated_lang = $target`" and every retry path has to re-check it. With the table it's `INSERT … ON CONFLICT (message_id, target_lang) DO NOTHING` — the database enforces exactly-once at the only point where it matters. The cache is not a bolt-on; it is the primary key.
2. **The async queue needs per-target retry state.** `attempts`, `next_attempt_at`, `error`, `status` are queue columns. Hung on `messages`, they pollute the hot table that every read path scans, and the partial index `WHERE status='pending'` — the one that makes the worker's claim query O(pending) instead of O(all messages) — can't exist cleanly.
3. **The owner can change their language.** `responders.language` is a column, not a constant. The day the owner switches from English to French, every existing conversation needs a second translation of the same visitor messages. With columns that is a destructive rewrite. With rows it is an insert.
4. **Second responder = second target language.** The whole point of the seam. One message, two responders, two languages → two rows. Zero schema change.

The cost is one join (or one `LEFT JOIN LATERAL`) on the read path. At this project's volume that is free, and the join is written once in `repo/messages.ts`.

**`skipped` status** covers `source_lang == target_lang` — inserted immediately, never queued, never hits OVH. Given English visitors talking to an English owner will be a large slice of traffic, this is the highest-leverage cost optimization in the system and it is one `WHERE` clause.

### `push_subscriptions`

```sql
create table push_subscriptions (
  id              bigint primary key generated always as identity,
  visitor_id      uuid not null references visitors(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  ua_family       text,             -- 'ios-safari' | 'android-chrome' | … (for the A2HS flow only)
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  fail_count      smallint not null default 0
);
create index push_subscriptions_visitor_idx on push_subscriptions (visitor_id);
```

`endpoint UNIQUE` handles the common case where the same browser re-subscribes and the push service returns the same endpoint — `ON CONFLICT (endpoint) DO UPDATE` keeps one row.

**No `expired_at` / tombstone column.** On `404`/`410` the row is **deleted** and `visitors.push_lost_at` is stamped. Rationale: a dead endpoint is not data, it is absence of data, and this project's privacy posture argues against retaining dead identifiers. `push_lost_at` is the one bit worth keeping — it tells the gate to re-ask on the visitor's next visit and tells the dashboard "this person is currently unreachable."

### `rate_limit_buckets`

```sql
create table rate_limit_buckets (
  key        text primary key,   -- 'v:<uuid>' or 'ip:<hex hmac>'
  tokens     real not null,
  updated_at timestamptz not null default now()
);
```

Token bucket refilled lazily in a single atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING tokens`. Chosen over an in-memory map because it survives container restarts (Coolify redeploys are frequent) and does not break if a second replica is ever added.

### No `settings` table in v1

Presence → `responders.is_online`. Owner language → `responders.language`. Welcome copy → locale JSON. VAPID keys, OVH key, model IDs → env/config. A `settings` key/value table would be an attractive nuisance; add it only when something genuinely owner-editable-at-runtime appears.

---

## Architectural Patterns

### Pattern 1: Translation is asymmetric — async for the visitor, sync-on-draft for the owner

**Recommendation: visitor→owner translates asynchronously *after* persistence and *after* delivery. Owner→visitor translates synchronously against the draft, before a message row exists.**

This looks like an inconsistency. It isn't — the two directions have genuinely different requirements, and reading them as one problem is what makes the question hard.

**Visitor → owner (async).** The requirements are "no message is ever lost" and "the owner may be offline." OVH is a third-party network call with a documented 429 regime. Any design where a visitor's message must survive an OVH round-trip before it is durable has made an external LLM API a single point of failure for the product's core promise. Also: the owner is *usually offline* when a visitor writes, so the translation is not on anyone's critical path. Translate later; nobody is waiting.

**Owner → visitor (sync, on the draft).** The requirement is explicit: *"Owner replies translated into the visitor's language on send, with preview before sending."* A preview is by definition synchronous — the owner is staring at the screen. But critically, **this happens before the message exists**. It is `POST /api/admin/translate` on a draft string, not a job on a persisted row. When the owner then hits send, the already-approved translation is written *in the same transaction* as the message:

```ts
// POST /api/admin/messages
await tx(async (c) => {
  const m = await insertMessage(c, { conversationId, authorSide: 'responder',
                                     responderId, body: draft, sourceLang: owner.language });
  // the human already approved this text — persist it, do not re-call OVH
  await insertTranslation(c, { messageId: m.id, targetLang: visitor.language,
                               status: 'ready', body: approvedTranslation, model });
  await c.query(`select pg_notify('chat', $1)`,
                [JSON.stringify({ c: conversationId, m: m.id, k: 'message' })]);
});
```

Net: an owner reply reaches the visitor **already translated, on the first SSE frame** — no shimmer, no second event — and costs zero extra OVH calls beyond the preview the human already requested. This is strictly better than "async both ways" and it falls out of the product requirement rather than fighting it.

**The full visitor-side flow:**

```
visitor types → POST /api/chat/messages
   ├─ rate-limit check (token bucket)         [reject early, no write]
   ├─ blocked check                            [silently accept, do not notify]
   └─ BEGIN
        insert messages(body=original, source_lang)         ← durable HERE
        insert message_translations(msg, owner.language, 'pending' | 'skipped')
        update conversations set last_message_at, last_visitor_message_at,
                                 status = case when status='new' then 'new' else status end
        pg_notify('chat', {c, m, k:'message'})
      COMMIT
   → 201 { id, created_at }                    ← visitor sees their own message confirmed
                                                  and the owner sees the ORIGINAL immediately

  ... translate-worker (interval ~1s) ...
   claim: UPDATE message_translations SET status='pending', attempts=attempts+1
          WHERE (message_id,target_lang) IN (
            SELECT message_id,target_lang FROM message_translations
            WHERE status='pending' AND next_attempt_at <= now()
            ORDER BY next_attempt_at LIMIT 8 FOR UPDATE SKIP LOCKED)
          RETURNING …
   → OVH chat completion, temperature 0, pinned model id
   → on success: status='ready', body=…  +  pg_notify('chat', {c, m, k:'translation'})
   → on 429/5xx: next_attempt_at = now() + backoff(attempts); status stays 'pending'
   → on attempts >= 5: status='failed', error=…  +  pg_notify(…{k:'translation'})
```

**Degradation contract — this is the part that must be non-negotiable in code:**

| Translation state | What the owner sees |
|---|---|
| `skipped` | Original only. No translation UI at all. |
| `pending` | **Original text, fully readable**, with a small "translating…" affordance beside it. |
| `ready` | Translation primary, "show original" toggle. |
| `failed` | **Original text**, with a quiet "translation unavailable — original shown" note and a manual retry button. |

At no point does the UI render an empty bubble or a spinner *in place of* the message. `messages.body` is `NOT NULL` and is the fallback in every branch. Rendering rule, once, in one component: `display = translation?.status === 'ready' ? translation.body : message.body`.

**Trade-off honestly stated:** the owner may briefly read an untranslated message in a script they cannot read. That is strictly better than the alternative failure mode — a visitor's message being rejected, delayed, or lost because an LLM endpoint was rate-limited.

---

### Pattern 2: One listener, one pool, zero connections held by SSE

**The pooled-client trap, stated explicitly:**

```ts
// ❌ WRONG — this silently stops working
const client = await pool.connect();
await client.query('LISTEN chat');
client.on('notification', handle);
client.release();          // ← LISTEN registration goes back into the pool with the socket.
                           //   The next unrelated pool.query() runs on this connection and
                           //   its result handler now also receives your notifications.
                           //   Or the pool reaps the idle client and you get silence.
```

`LISTEN` is **per-connection session state**. A pool exists precisely to make "which connection am I on" unknowable. The two are fundamentally incompatible. Three concrete failure modes people hit:

1. `release()` returns the socket; notifications arrive on a client nobody is listening to.
2. `pool.query()` (the shortcut form) checks out an *arbitrary* connection — `LISTEN` issued that way lands on a random socket.
3. The pool's `idleTimeoutMillis` reaps the connection; the app goes quiet with no error and realtime "just stops" hours after deploy.

**Correct topology:**

```ts
// src/server/db/listener.ts — module singleton, never released
let client: Client | null = null;

async function connect() {
  client = new Client({ connectionString: process.env.DATABASE_URL });
  client.on('error', (e) => { console.error('[listener]', e); scheduleReconnect(); });
  client.on('end',   () => scheduleReconnect());
  client.on('notification', (msg) => {
    const p = JSON.parse(msg.payload!);
    if (msg.channel === 'chat')     hub.publishChat(p.c, p.m, p.k);
    if (msg.channel === 'presence') hub.publishPresence(p);
  });
  await client.connect();
  await client.query('LISTEN chat');
  await client.query('LISTEN presence');
  backoff = 500;
  // resync: any events that fired while we were disconnected are recovered by
  // clients' own Last-Event-ID backfill on their next reconnect, and by the
  // undelivered-message sweeper. The listener does not need its own catch-up.
}
```

`pg.Client` does **not** auto-reconnect. The `error` + `end` handlers and an exponential-backoff reconnect are mandatory, not optional hardening — a single Postgres restart or Coolify DB redeploy otherwise kills realtime permanently until the app container is restarted.

**Connection budget:** `1` (listener) `+ pool.max ≈ 10` = 11. This is fixed and does **not** grow with the number of connected visitors, because:

**The second trap — SSE handlers must hold no DB connection.** The natural-looking implementation checks out a client for the stream's lifetime. 50 concurrent visitors then exhausts a pool of 10 and every write in the app blocks. The stream body must only ever do short `pool.query()` calls (backfill, then per-event fetch) and be otherwise connection-free while idle.

**Global channel, not per-conversation.** `LISTEN chat_conv_1234` per conversation would require issuing `LISTEN`/`UNLISTEN` on the shared listener client as visitors come and go — extra round-trips, ordering hazards, and leaked registrations on crash. Instead: two fixed channels, and fan-out happens in-process via `hub`'s `Map<conversationId, Set<Subscriber>>`. Payload volume is tiny (a few dozen bytes) and the app is a single process. Bonus: this design *does* survive horizontal scaling — each replica's listener receives every notification and fans out to its own local subscribers.

**Payloads are pointers, never content.**

```json
{"c": 1234, "m": 88771, "k": "message"}
```

Reasons: `pg_notify` payloads are capped at 8000 bytes; message bodies plus translations can exceed that; and pointer-only means the live path and the backfill path run **the same query**, so there is exactly one place where "what a message looks like on the wire" is defined.

---

### Pattern 3: SSE with `messages.id` as the event id, and DB-backed backfill

```ts
// src/app/api/chat/stream/route.ts
export const runtime  = 'nodejs';        // required: pg driver
export const dynamic  = 'force-dynamic'; // required: otherwise Next treats it as ISR
                                         // and BUFFERS the entire response — no streaming

export async function GET(req: NextRequest) {
  const visitor = await requireVisitor();               // httpOnly cookie
  const conv    = await repo.conversations.openFor(visitor.id);
  const since   = Number(req.headers.get('last-event-id') ?? 0);

  let sub: Subscriber;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (id: number | null, event: string, data: unknown) =>
        controller.enqueue(enc.encode(
          (id ? `id: ${id}\n` : '') + `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      send(null, 'hello', { retry: 3000 });
      controller.enqueue(enc.encode('retry: 3000\n\n'));

      // 1. SUBSCRIBE FIRST, buffering — closes the gap between backfill and live
      const buffered: Evt[] = [];
      let live = false;
      sub = hub.subscribe(conv.id, (e) => live ? emit(e) : buffered.push(e));

      // 2. backfill everything the client missed
      let high = since;
      for (const m of await repo.messages.since(conv.id, since)) { send(m.id, 'message', m); high = m.id; }

      // 3. flush buffer, deduped by id, then go live
      for (const e of buffered) if (e.messageId > high) emit(e);
      live = true;
    },
    cancel() { hub.unsubscribe(sub); }
  });

  req.signal.addEventListener('abort', () => hub.unsubscribe(sub));

  return new Response(stream, { headers: {
    'Content-Type':      'text/event-stream; charset=utf-8',
    'Cache-Control':     'no-cache, no-transform',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  }});
}
```

**Why `messages.id` as the event id:** it is already monotonic, already durable, already indexed, and backfill is a one-line query — `WHERE conversation_id = $1 AND id > $2 ORDER BY id`. No separate event log, no in-memory ring buffer, no bounded replay window. A visitor who was offline for a week reconnects and receives everything they missed, which is exactly the product's "no message is ever lost" promise expressed as a query.

**`Last-Event-ID` is sent automatically** by the browser's `EventSource` on reconnect — you do not implement it client-side. But the server must both *emit* `id:` on every event and *read* the header, or reconnects silently replay nothing. `EventSource` cannot set custom headers, which is another reason auth here must be cookie-based.

**Identity-sequence ordering caveat.** `bigint identity` values are assigned at insert but committed possibly out of order under concurrency (txn A takes 5, txn B takes 6, B commits first). A naive `id > lastSent` live filter could permanently skip 5. Mitigation, already in the design: the live path does **not** trust the notified id — it re-runs `WHERE conversation_id = $1 AND id > $lastSentId ORDER BY id` and emits whatever committed rows it finds. Straggler 5 is picked up by the query triggered by 6. With a single writer per conversation direction this is nearly unreachable anyway, but the mitigation is free.

**Heartbeat.** Emit `: ping\n\n` every 20–25s. This is not optional: mobile carrier NATs, and any proxy in the path, drop idle connections at 30–60s. The comment frame keeps bytes flowing and also lets the server detect a dead peer (write throws → `cancel()` → unsubscribe).

**Behind Coolify's Traefik.** Traefik does not buffer responses by default, so SSE works out of the box — but the headers above are still required because (a) `no-transform` prevents any compression middleware from buffering, (b) `X-Accel-Buffering: no` is inert on Traefik and essential the day an nginx or Cloudflare tunnel is put in front, and (c) **Next.js response compression must be disabled for this route** — gzip buffers, and a gzipped SSE stream delivers nothing until the buffer fills. Also confirm no idle-timeout is configured on the Traefik entrypoint (`respondingTimeouts.readTimeout`/`idleTimeout`); with the 20s heartbeat, defaults are safe.

**Two streams, one implementation.** `/api/chat/stream` subscribes to one conversation; `/api/admin/stream` subscribes to *all* (`hub.subscribeAll()`). Same code path, different subscription scope.

---

### Pattern 4: Push fires from the write path, gated by a delivery ACK

**When exactly does a push fire:** when a **responder** message has not been acknowledged as rendered by the visitor within a short grace window. Not "when the owner replies," and not "when the visitor has no SSE connection."

```
owner sends reply
   └─ COMMIT (message + translation + pg_notify)
        ├─ live SSE fan-out → visitor's open tab renders it
        │     └─ tab (if document.visibilityState === 'visible')
        │          POST /api/chat/delivered {ids:[…]}  →  messages.delivered_at = now()
        │
        └─ push-worker (interval ~3s):
             SELECT m.* FROM messages m
             WHERE m.author_side='responder'
               AND m.delivered_at IS NULL
               AND m.created_at < now() - interval '8 seconds'
               AND m.push_attempted_at IS NULL
             FOR UPDATE SKIP LOCKED
           → for each visitor: web-push to every subscription row
```

**Why an ACK and not a presence check.** The obvious design — "is there an open SSE for this visitor in the `hub` map?" — is wrong in three ways: an open SSE does not mean the tab is *visible* (backgrounded mobile tabs keep connections alive briefly then get frozen mid-stream); in-memory presence dies on container restart, so a redeploy at the wrong moment loses the notification permanently; and it does not survive a second replica. `delivered_at` is a durable, restart-proof, replica-proof fact about whether a human actually saw the message. The 8-second grace window is what buys the live path a chance to win.

**Do not "suppress" the push at the service worker level.** Every major browser penalizes a `push` event that resolves without calling `showNotification()` — repeated silent pushes cause the browser to revoke the permission or show a generic "this site was updated in the background" notification. The service worker must *always* show something. The correct place to avoid double-notifying is the server (`delivered_at`), plus one client-side refinement:

```js
// public/sw.js
self.addEventListener('push', (e) => e.waitUntil((async () => {
  const d = e.data.json();
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const focused = clients.some(c => c.focused && c.visibilityState === 'visible');
  // still MUST show a notification — but make it non-intrusive if they're looking at it
  await self.registration.showNotification(d.title, {
    body: d.body, tag: `conv-${d.c}`, renotify: !focused,
    silent: focused, requireInteraction: false, data: { url: '/' },
  });
})()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = cs.find(c => new URL(c.url).origin === self.location.origin);
    if (existing) return existing.focus();
    return self.clients.openWindow('/');
  })());
});
```

`tag: 'conv-<id>'` collapses a burst of replies into one notification instead of five. Pair it with `topic` on the server side (`web-push` option, ≤32 URL-safe base64 chars) so the *push service itself* replaces an undelivered earlier push rather than queuing both.

**Send options:** `TTL: 86400` (a pastoral reply is still worth delivering a day later; the product explicitly keeps conversations indefinitely), `urgency: 'high'`, `topic: 'c<conversationId>'`.

**Payload contains no message content.** `{title: t(lang,'push.title'), body: t(lang,'push.body'), c: convId}` — a localized "You have a new reply", never the pastoral text. The push service (Google/Mozilla/Apple) sits between you and the user; encrypted or not, sensitive content should not transit it, and this also removes any translation dependency from the push path.

**Expired-subscription lifecycle:**

```ts
try {
  await webpush.sendNotification(sub, payload, { TTL: 86400, urgency: 'high', topic });
  await repo.push.markSuccess(sub.id);
} catch (err: any) {
  if (err.statusCode === 404 || err.statusCode === 410) {
    await repo.push.remove(sub.id);                       // hard delete
    if (await repo.push.countFor(visitorId) === 0)
      await repo.visitors.markPushLost(visitorId);        // gate re-asks on next visit
  } else if (err.statusCode === 429) {
    await repo.push.deferRetry(sub.id, err.headers?.['retry-after']);
  } else {
    await repo.push.bumpFailure(sub.id);                  // delete at fail_count >= 5
  }
}
```

`push_attempted_at` is stamped regardless of outcome so the worker never re-scans the same message forever. `delivered_at` remains NULL — the dashboard should show "delivered" vs "notified" vs "unreachable" as three distinct states, and `visitors.push_lost_at` is what makes "unreachable" visible to the owner.

---

### Pattern 5: The second-responder seam — three columns, zero routing

v1 ships one responder. The seam is entirely in the schema and costs essentially nothing:

| Seam element | Present in v1 | What it unlocks later |
|---|---|---|
| `responders` table (not a `users` singleton, not env vars) | Seeded with 1 row | Add a row = add a person |
| `responders.language` | Read on every translation | Per-responder target language, already handled by `(message_id, target_lang)` |
| `responders.is_online` | Drives the visitor's online/offline experience | "Any responder online" becomes `EXISTS (… WHERE is_online)` |
| `conversations.assigned_responder_id` (nullable FK) | **Written but never read** in v1 | Routing/claiming is a `WHERE` clause, not a migration |
| `messages.responder_id` (nullable FK) | Stamped on every reply | "Who said this" attribution already in history |
| Session cookie carries `responder_id`, not `isAdmin: true` | Yes | Authorization becomes per-row without touching auth |

**Explicitly NOT built in v1** — and these are the things that would be a rebuild if you tried to anticipate them: assignment rules, round-robin, claim/unclaim UI, per-responder inbox filters, handoff notes, permissions/roles beyond a `role` string, presence-based routing, notification fan-out to multiple responders.

The single most valuable line: **stamp `assigned_responder_id` on first reply from day one, even though nothing reads it.** Historical data then already has the shape routing will need, so turning routing on is additive rather than a backfill against ambiguous history.

---

## Data Flow

### Visitor sends a message

```
[type + send]
    │
    ▼
POST /api/chat/messages ──► rate-limit (token bucket) ──► blocked? ──► repo.messages.create()
                                                                            │  (one txn)
                                                     ┌──────────────────────┴──────────────────┐
                                                     │ INSERT messages (original)              │
                                                     │ INSERT message_translations (pending)   │
                                                     │ UPDATE conversations (denorm timestamps)│
                                                     │ pg_notify('chat', {c,m,k:'message'})    │
                                                     └──────────────────────┬──────────────────┘
                                                                            │ COMMIT
                              ┌─────────────────────────────────────────────┤
                              ▼                                             ▼
                   db/listener (dedicated Client)                   201 → visitor's own
                              │                                     bubble confirmed
                              ▼
                        realtime/hub.publish(convId)
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
        visitor's own SSE       owner's /api/admin/stream
        (echo, harmless)        ──► owner sees ORIGINAL text immediately
                                     with "translating…" beside it

     ... later (≤ ~1s) ...
     translate-worker ──► OVH ──► UPDATE …status='ready' ──► pg_notify(k:'translation')
                                                          ──► hub ──► owner's SSE patches the bubble
```

### Owner replies

```
[owner types draft]
    │
    ▼ (on blur / explicit "preview")
POST /api/admin/translate {draft, from: owner.lang, to: visitor.lang}
    └──► OVH (sync, 429 → surface "preview unavailable, send anyway?") ──► preview shown
    │
    ▼ [owner approves + sends]
POST /api/admin/messages {body: draft, translation: approved}
    └── one txn: INSERT messages + INSERT message_translations(status='ready')
                 + UPDATE conversations(status='in_progress', last_responder_message_at)
                 + pg_notify('chat', …)
    │
    ├──► hub ──► visitor's open SSE ──► rendered ALREADY TRANSLATED, first frame
    │                                       └──► POST /api/chat/delivered → delivered_at
    │
    └──► (+8s) push-worker: delivered_at still NULL?
              └──► web-push ──► service worker ──► showNotification(tag: conv-N)
                                     └──► click ──► focus/open '/' ──► SSE reconnect
                                                    with Last-Event-ID ──► backfill
```

### Reconnect / offline recovery (the "no message is ever lost" path)

```
tab closed for 3 days  →  reopen  →  EventSource('/api/chat/stream')
                                       └─ Last-Event-ID: 88712  (browser sends automatically)
                                            └─ SELECT … WHERE conversation_id=$1 AND id > 88712
                                                 └─ replays every missed message + translation
                                                      └─ then attaches to live hub
```

There is no separate "load history" endpoint and no separate "catch up" logic. Backfill *is* history loading — a fresh visitor arrives with no `Last-Event-ID`, `since = 0`, and receives their whole conversation through the same code path.

### State management (client)

```
localStorage: { lang, appearance }   ← pre-hydration, non-sensitive, also mirrored to cookie
                                        so the server can render <html lang dir class> correctly
httpOnly cookie: visitor_id          ← never readable by JS
React state: messages[]              ← seeded and maintained ONLY by the SSE stream
                                        (optimistic local echo keyed by client_msg_id,
                                         reconciled when the server event with the same
                                         client_msg_id arrives)
```

Single-source-of-truth rule: the SSE stream is the only writer of `messages[]`. POST responses do not append; they only resolve the optimistic echo. This eliminates the entire class of duplicate/ordering bugs that comes from two writers.

---

## Build Order Assessment

**Proposed:** (1) foundation + visitor chat + i18n → (2) push gate + translation → (3) admin dashboard + harden + ship.

**Verdict: the shape is right — foundation, then the two risky externals, then the owner surface. Five dependencies force adjustments; two are hard blockers.**

### 🔴 Blocker 1 — the translation spike must run *inside* Phase 1, before locale files

`PROJECT.md` already establishes this: no OVH model documents Swahili support, and the answer changes the supported-language list. But translation is scheduled for Phase 2 while i18n locale JSON is written in Phase 1. **Writing 10 locale files before you know whether there are 10 locales is rework.**

Fix: Phase 1 opens with a *spike only* — a script that calls OVH with the pinned model and round-trips a paragraph in all 10 languages, Swahili first. It is ~50 lines, needs no schema and no UI, and its output is an input to the very next task. The full translation *feature* stays in Phase 2. This costs Phase 1 half a day and de-risks the largest unknown in the project.

### 🔴 Blocker 2 — Phase 1 cannot verify realtime without a reply surface

"Visitor chat + SSE" with no way for a responder to send anything means the entire LISTEN/NOTIFY → hub → SSE → backfill chain — the most failure-prone code in the system, and the code where the pooled-client trap and the `force-dynamic` buffering trap live — goes **unexercised until Phase 3.** Discovering in Phase 3 that your realtime topology is wrong is a Phase-1 rewrite.

Fix: pull the *minimum* owner surface into Phase 1 — login (bcrypt + jose session), a conversation list with no filters, a reply box, and `/api/admin/stream`. Phase 3 then becomes dashboard **completion** (priority sort, filters, search, status controls, faith-decision flag, at-a-glance counts, mobile polish) rather than "admin from zero." Net effort is roughly unchanged; risk moves from late to early, which is the whole point.

### 🟡 Adjustment 3 — presence is a Phase 1 behavior

"Owner online → real-time; owner offline → welcome-only, messages still stored" is a **visitor-chat** requirement in Phase 1, but the presence toggle is listed under Phase 3. Ship `responders.is_online` + the presence NOTIFY channel + the visitor-side read in Phase 1; the toggle *UI* can wait for Phase 3.

### 🟡 Adjustment 4 — the push gate wraps Phase 1's UI, so build the wrapper in Phase 1

The gate is a **hard block in front of the chat**. If it lands in Phase 2, Phase 1's entry flow is structurally different from the shipped one, and Phase 2 has to re-plumb the app's outermost layer. Fix: build the `<Gate>` wrapper component and the `manifest.webmanifest` + `sw.js` registration in Phase 1, with the gate satisfied by an env flag (`PUSH_GATE=off`). Phase 2 fills in the real permission logic, the localized decline re-ask, and the iOS Add-to-Home-Screen screen behind the same seam. Registering the service worker with the correct scope in Phase 1 also avoids scope-migration pain later.

### 🟡 Adjustment 5 — rate limiting is Phase 1, not Phase 3 "harden"

`POST /api/chat/messages` is an unauthenticated, anonymous write endpoint. It should not exist for one day without a limiter, not even on a staging URL. The token-bucket table is ~30 lines. Owner **block** and manual **delete** can stay in Phase 3 (they are dashboard features); the limiter cannot.

### Revised build order

| Phase | Contents | Why here |
|---|---|---|
| **1 — Foundation & the realtime spine** | OVH translation spike (Swahili gate) → migrations (all 7 tables incl. `responders`, nullable `assigned_responder_id`) → pool + listener + hub + SSE with `Last-Event-ID` backfill → visitor cookie identity → send endpoint + rate limiter → i18n locale files & RTL → `<Gate>` shell (bypassed) + SW registration + manifest → minimal owner login & reply surface → presence read path | Every downstream phase depends on the message pipeline being *proven*, and the spike's answer is an input to the locale files written in the same phase |
| **2 — Reachability & language** | Real push gate + localized decline re-ask + iOS A2HS screen → `push_subscriptions` + `web-push` send + 410 cleanup + `delivered_at` ACK + push-worker → translate-worker + OVH backoff + `(message_id, target_lang)` cache → owner draft-preview translation → "show original" toggle | Both externals (push service, OVH) are now isolated to one phase, on top of a pipeline already known to work |
| **3 — Owner surface, hardening, ship** | Inbox priority sort / filters / search / counts → status controls + faith-decision flag → presence toggle UI → block + delete → mobile polish → Coolify deploy, Traefik SSE verification, VAPID key generation, backups | Pure additive UI over a schema that already carries every field it needs |

**Dependency that would change everything if it fails:** the Phase 1 Swahili spike. If it fails, the decision (drop Swahili vs. add a second provider for one language) must be made *before* locale files are written and before the language picker is built. Everything else in the roadmap has slack; this does not.

---

## Scaling Considerations

| Scale | Adjustments |
|---|---|
| **0–500 visitors, single owner (v1 reality)** | Nothing. One container, `pool.max = 10`, one listener. Postgres does not notice this workload. |
| **~5k conversations / a few hundred concurrent SSE** | Node holds thousands of idle sockets fine. Watch container memory (each stream is a closure + a `Set` entry, ~KBs). Add `messages(conversation_id, id)` covering index (already specified). Move heartbeat to a single shared 20s interval that walks the hub rather than one timer per stream. |
| **Multiple responders / 2+ replicas** | Already works: each replica runs its own listener on the same global channels and fans out locally. The only piece needing attention is the rate limiter — already DB-backed for this reason. Sticky sessions **not** required, because SSE state is reconstructible from `Last-Event-ID`. |
| **Translation volume approaching 400 rpm** | Batch multiple pending rows into one completion, or add a second pinned model and shard by `target_lang`. The `message_translations` queue table makes both changes local to the worker. |

### Scaling priorities

1. **First bottleneck: OVH rate limits, not Postgres.** 400 rpm is roughly 6.7 messages/second sustained. The `skipped` optimization (same-language pairs) and the `(message_id, target_lang)` cache are the two things that keep you well under it. Instrument `429` counts from day one.
2. **Second bottleneck: SSE socket count vs. container memory.** Long before Postgres cares. Mitigate with the shared heartbeat timer and by not retaining message bodies in per-stream closures.
3. **Third: inbox query as conversation count grows.** Already mitigated by the denormalized `last_*_at` columns and the partial priority index. Search is the weak spot — start with `pg_trgm` GIN on `messages.body` and `ILIKE`, which avoids the impossible problem of choosing one `tsvector` language configuration for ten languages.

---

## Anti-Patterns

### Anti-Pattern 1: `LISTEN` on a pooled client

**What people do:** `const c = await pool.connect(); c.query('LISTEN chat'); c.on('notification', …); c.release();` — or worse, `pool.query('LISTEN chat')`.
**Why it's wrong:** `LISTEN` is per-connection session state; a pool deliberately makes the connection identity non-deterministic. Realtime works in dev and dies silently in production after the pool reaps or reassigns the socket.
**Do this instead:** one dedicated `pg.Client` module singleton, never released, with explicit `error`/`end` handlers and a backoff reconnect that re-issues `LISTEN`.

### Anti-Pattern 2: Holding a DB connection for the life of an SSE stream

**What people do:** check out a client in the stream's `start()` and release it in `cancel()`.
**Why it's wrong:** DB connections become O(concurrent visitors). Fifty visitors exhaust a ten-connection pool and every write in the app blocks behind them. It looks fine with two test tabs.
**Do this instead:** the stream holds a `hub` subscription (pure memory) and issues short `pool.query()` calls only when an event arrives.

### Anti-Pattern 3: Making a message's durability depend on the translation call

**What people do:** `const t = await translate(body); await insert({body, translated: t});`
**Why it's wrong:** a 429, a timeout, or an OVH outage now loses or blocks a visitor's message — violating the product's single hardest promise. It also puts multi-second LLM latency in the visitor's send path on mobile.
**Do this instead:** persist the original first, in its own transaction, and translate afterwards. `messages.body` is `NOT NULL` and is the render fallback in every translation state.

### Anti-Pattern 4: Overwriting the original with the translation

**What people do:** `UPDATE messages SET body = translated`.
**Why it's wrong:** the original is unrecoverable, "show original" becomes impossible, a bad translation of a faith conversation cannot be audited, and re-translating to a new target language is lost forever. `PROJECT.md` explicitly defers a faith-glossary *because* "show original" is the safeguard — that safeguard must be structurally guaranteed.
**Do this instead:** translations live in their own rows. `messages.body` is immutable.

### Anti-Pattern 5: Forgetting `export const dynamic = 'force-dynamic'` on the SSE route

**What people do:** write a perfectly good `ReadableStream` route handler.
**Why it's wrong:** Next.js may treat the route as statically generable / ISR and **buffer the entire response**. The stream never flushes; the symptom is "SSE works locally, hangs in the container," which sends people hunting the proxy for hours.
**Do this instead:** `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';` plus `Cache-Control: no-cache, no-transform` and compression disabled for the route.

### Anti-Pattern 6: Emitting SSE events with no `id:`

**What people do:** `data: {...}\n\n` and nothing else.
**Why it's wrong:** `EventSource` reconnects constantly on mobile (network switches, tab freeze, proxy timeouts). Without ids there is no `Last-Event-ID`, so every reconnect is a silent gap. In a product whose promise is "no message is ever lost," this is the promise failing invisibly.
**Do this instead:** `id: <messages.id>` on every message event, and read `Last-Event-ID` on connect to backfill from the DB.

### Anti-Pattern 7: A `push` handler that doesn't call `showNotification()`

**What people do:** check whether the tab is open and silently drop the push to avoid double-notifying.
**Why it's wrong:** browsers treat a silent push as abuse — Chrome shows a generic "site updated in background" notification and repeated offences can revoke the permission. Given that push permission is a **hard gate** on this product, losing it means losing the visitor entirely.
**Do this instead:** decide server-side using `delivered_at` + an 8s grace window; if a push does go out, always `showNotification()`, using `tag` + `silent` + `renotify: false` to make it unobtrusive when a client is already focused.

### Anti-Pattern 8: Storing the raw IP for rate limiting

**What people do:** `visitors.ip TEXT`.
**Why it's wrong:** an IP is personal data. The project's stated constraint is that no personal data may be collected — a raw IP column quietly breaks the product's central promise.
**Do this instead:** `HMAC-SHA256(server_secret, ip)` stored as `bytea`, used only as a bucket key.

### Anti-Pattern 9: A client-generated visitor ID sent as a request parameter

**What people do:** `crypto.randomUUID()` in `localStorage`, sent as `X-Visitor-Id` or a query param.
**Why it's wrong:** it is a bearer token the client fully controls, readable by any XSS and forgeable/enumerable in principle — granting read access to someone's pastoral conversation.
**Do this instead:** server-generated `gen_random_uuid()` in an httpOnly `SameSite=Lax` cookie. `localStorage` keeps only language and appearance.

---

## Integration Points

### External Services

| Service | Integration Pattern | Gotchas |
|---|---|---|
| **Postgres** | `pg.Pool` (queries) + one dedicated `pg.Client` (LISTEN). `pg_notify` inside the writing transaction. | Notification fires only on commit — correct and desirable. Payload cap 8000 bytes → send pointers. `Client` has no auto-reconnect. |
| **OVHcloud AI Endpoints** | OpenAI SDK, `baseURL: https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`, `temperature: 0`, system-prompt translation (no `/v1/translations` endpoint exists). | Model IDs drift between catalog and live `GET /v1/models` → **pin in config, never in code**. 400 rpm authenticated; anonymous tier (2 rpm) is unusable. 429 → exponential backoff via `next_attempt_at`. Swahili coverage unverified on every candidate model. |
| **Web Push (FCM/Mozilla/Apple)** | `web-push` + self-generated VAPID. `setVapidDetails(subject, pub, priv)` once at boot. | Subject must be `mailto:` or `https:` — Firefox requires `mailto:`; Safari rejects localhost. `404`/`410` → delete row. `429` → honour `Retry-After`. iOS requires an installed PWA (hence the A2HS screen). |
| **Traefik (Coolify)** | Reverse proxy, TLS. | No response buffering by default, but set `X-Accel-Buffering: no` + `no-transform` anyway and disable compression on the SSE route. Verify entrypoint idle timeouts against the 20s heartbeat. |

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| route handlers ↔ `server/repo` | direct function calls | The **only** place SQL exists. Handlers contain zero SQL. |
| `repo` (writer) ↔ SSE handlers (reader) | Postgres `NOTIFY` → `db/listener` → `hub` | Deliberately indirect: the writer never knows who is listening, so a second replica or a second responder needs no writer change. |
| `hub` ↔ SSE streams | in-memory `Map<convId, Set<Subscriber>>` | Process-local by design. Correct across replicas because every replica listens to the same global channel. |
| `jobs/*` ↔ `repo` | `FOR UPDATE SKIP LOCKED` claim + update | Makes the workers safe to run in N replicas with no coordination service. |
| `translation/` ↔ everything else | pure functions, `(text, from, to) => text` | No DB imports. Independently testable; swappable if the Swahili spike forces a second provider. |
| `server/**` ↔ client components | **forbidden** | Enforced by `import 'server-only'` at the top of every `server/` module. |

---

## Sources

- node-postgres — Client API, `notification` / `error` events, pooling docs (Context7 · `/brianc/node-postgres`) — **MEDIUM** (curated, single-source)
- Next.js — Route Handler streaming, `dynamic = 'force-dynamic'` / ISR buffering, `req.signal` abort (Context7 · `/vercel/next.js`) — **MEDIUM** (curated, single-source)
- web-push — `setVapidDetails`, `sendNotification` error `statusCode` semantics (404/410/429), `TTL`/`urgency`/`topic` options (Context7 · `/web-push-libs/web-push`) — **MEDIUM** (curated, single-source)
- SSE `Last-Event-ID` reconnect + backfill patterns — [codelit.io SSE guide](https://codelit.io/blog/sse-server-sent-events-guide), [Ithy: reliable SSE streaming](https://ithy.com/article/sse-streaming-retries-v0p7rdp1), [opencode #25657 — real-world data loss without `Last-Event-ID`](https://github.com/anomalyco/opencode/issues/25657) — **LOW-MEDIUM** (web sources; the mechanism is WHATWG-standard and consistently described, but not cross-checked against the spec text here)
- `.planning/PROJECT.md` — locked stack, constraints, OVH findings (verified 2026-07-20) — **HIGH** (project-owned)

**Unverified / needs a spike:**
- Swahili translation quality on any OVH model (already the project's flagged #1 risk).
- Traefik entrypoint idle-timeout defaults on the specific Coolify version — verify empirically at deploy, since the failure mode (SSE dying at 60s) is silent.
- iOS Safari PWA push reliability after the home-screen install, particularly whether a backgrounded PWA reliably wakes the service worker — worth a real-device test in Phase 2 rather than a doc read.

---
*Architecture research for: anonymous 1:1 realtime pastoral chat, self-hosted Next.js + Postgres*
*Researched: 2026-07-20*
