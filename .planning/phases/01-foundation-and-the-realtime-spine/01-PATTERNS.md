# Phase 1: Foundation and the Realtime Spine - Pattern Map

**Mapped:** 2026-07-20
**Files analyzed:** 30 (new; all creations — nothing exists to modify)
**Analogs found:** 0 / 30 — **greenfield repository, no existing analogs anywhere**

## Codebase State

Verified directly (directory listing, working tree root): the repository contains only `.git/`, `.claude/` (instructions), `.planning/` (planning docs), `.gitignore`, and `PRD-chat-site.md`. **There is no `package.json`, no `src/`, no `app/`, no test files, no Dockerfile, no migrations — no application code of any kind.** This is not an error or an oversight; it is the actual, confirmed state of the repo at the start of Phase 1.

**Consequence for this document:** there are no in-repo analogs to point the planner at. No file in the classification table below has a codebase-internal "closest analog." Every pattern assignment instead points to the concrete code examples already authored in `01-RESEARCH.md` (Patterns 1–8) and `.claude/CLAUDE.md`, which were written specifically for this stack and this phase. Treat those as the canonical reference implementations — they are not "the closest thing we found," they are the intended shape of the code, sourced from Context7-verified library docs (postgres.js, jose, drizzle-orm) rather than reverse-engineered from adjacent files, because no adjacent files exist.

Do not fabricate analog file paths. Every "Analog" field below is explicitly `none (greenfield)`.

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/server/db/pool.ts` | config/service | request-response | none (greenfield) | n/a — see RESEARCH.md Pattern 1 context |
| `src/server/db/listener.ts` | service | event-driven | none (greenfield) | n/a — see RESEARCH.md Pattern 1 |
| `src/instrumentation.ts` | config | event-driven | none (greenfield) | n/a |
| `src/server/realtime/hub.ts` | service | pub-sub | none (greenfield) | n/a |
| `app/api/chat/stream/route.ts` | route (SSE) | streaming | none (greenfield) | n/a — see RESEARCH.md Pattern 2 |
| `app/api/admin/stream/route.ts` | route (SSE) | streaming | none (greenfield) | n/a — sibling of chat/stream, owner-scoped |
| `app/api/chat/messages/route.ts` | route (API) | CRUD (write) | none (greenfield) | n/a |
| `app/api/messages/route.ts` (`?since=`) | route (API) | CRUD (read/poll) | none (greenfield) | n/a — shares query with Last-Event-ID backfill |
| `app/api/chat/prefs/route.ts` | route (API) | CRUD (write) | none (greenfield) | n/a |
| `app/api/admin/messages/route.ts` | route (API) | CRUD (write) | none (greenfield) | n/a — mirrors chat/messages, owner scope |
| `app/api/admin/setup/route.ts` | route (API) | request-response | none (greenfield) | n/a — see RESEARCH.md Pattern 5 |
| `app/api/admin/login/route.ts` | route (API) | request-response | none (greenfield) | n/a — see RESEARCH.md Patterns 3–4 |
| `src/server/auth/session.ts` | service | transform | none (greenfield) | n/a — see RESEARCH.md Pattern 3 |
| `src/server/auth/password.ts` | service | transform | none (greenfield) | n/a — see RESEARCH.md Pattern 4 |
| `src/server/auth/guard.ts` | middleware | request-response | none (greenfield) | n/a |
| `proxy.ts` | middleware | request-response | none (greenfield) | n/a — Next 16 rename of `middleware.ts` |
| `src/server/repo/visitors.ts` | model/repo | CRUD | none (greenfield) | n/a |
| `src/server/repo/conversations.ts` | model/repo | CRUD | none (greenfield) | n/a |
| `src/server/repo/messages.ts` | model/repo | CRUD | none (greenfield) | n/a |
| `src/server/repo/ratelimit.ts` | model/repo | CRUD | none (greenfield) | n/a — see RESEARCH.md Pattern 7 |
| `drizzle/*.sql` (7-table schema) | migration | batch | none (greenfield) | n/a |
| `scripts/migrate.mjs` | utility (boot) | batch | none (greenfield) | n/a — see RESEARCH.md Pattern 8 |
| `scripts/translation-spike.mjs` | utility (standalone script) | batch | none (greenfield) | n/a — see RESEARCH.md Pattern 6 |
| `src/server/i18n/detect.ts` | utility | transform | none (greenfield) | n/a |
| `src/server/i18n/dir.ts` | utility | transform | none (greenfield) | n/a |
| `lib/i18n/locales/*.json` | config | transform | none (greenfield) | n/a — pending FOUND-01 go/no-go |
| `app/layout.tsx` | component (RSC) | request-response | none (greenfield) | n/a |
| `app/page.tsx` | component | request-response | none (greenfield) | n/a |
| `app/admin/setup/page.tsx` / `login/page.tsx` / `(auth)/page.tsx` / `(auth)/c/[id]/page.tsx` | component | request-response | none (greenfield) | n/a |
| `public/sw.js`, `public/manifest.webmanifest` | config/static | event-driven (SW) | none (greenfield) | n/a — stub only this phase |
| `Dockerfile` | config | batch | none (greenfield) | n/a — see `.claude/CLAUDE.md` §1 |

## Pattern Assignments

No in-repo analogs exist for any file in this phase. Below, each cluster of new files is pointed at the concrete reference implementation already produced by research — these are drop-in-adaptable, not abstract descriptions.

### Realtime spine — `src/server/db/listener.ts`, `src/server/realtime/hub.ts`, `app/api/chat/stream/route.ts`, `app/api/admin/stream/route.ts`

**Reference:** `01-RESEARCH.md` Pattern 1 (`sql.listen()`, lines ~297-328) and Pattern 2 (SSE route, lines ~330-382).

Key excerpt to copy the shape of (dedicated LISTEN connection, `max: 1`, re-fires `onListen` on reconnect):
```ts
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
await sql.listen('chat', (payload) => { /* JSON.parse, hub.publishChat(...) */ }, () => {
  console.log('[listener] ready (chat)');
});
```
SSE route must set `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'` — the second is load-bearing per `.claude/CLAUDE.md` and confirmed in RESEARCH.md Pattern 2; omitting it causes Next to buffer the whole stream. Subscribe to the hub **before** running the `since=` backfill query, buffering live events until backfill completes, to close the gap between "subscribed" and "caught up." Release the subscription on `req.signal`'s `abort` event — the only reliable client-disconnect hook (confirmed via Context7, cited in RESEARCH.md).

`app/api/admin/stream/route.ts` is the same shape with owner-scope auth (`guard.ts`) substituted for `requireVisitor()`, per D-13 — same hub, `hub.subscribeAll()` instead of `hub.subscribe(conv.id, ...)`.

### Auth — `src/server/auth/session.ts`, `src/server/auth/password.ts`, `app/api/admin/login/route.ts`, `app/api/admin/setup/route.ts`, `proxy.ts`

**Reference:** RESEARCH.md Pattern 3 (jose session, lines ~384-414), Pattern 4 (Argon2id, lines ~416-432), Pattern 5 (setup 404-by-construction, lines ~434-452).

Both visitor-ID and owner-session cookies use the same `jose` `SignJWT`/`jwtVerify` instance and env secret, distinguished only by a `typ` claim (`'visitor'` vs `'owner'`) — this is what keeps `proxy.ts` a single verify-then-branch, not two auth systems.

Setup route's core (must run on **every** request, never cached):
```ts
const [{ exists }] = await sql`select exists(select 1 from responders) as exists`;
if (exists) return new Response(null, { status: 404 });
const token = req.headers.get('x-setup-token');
if (token !== process.env.SETUP_TOKEN) return new Response(null, { status: 404 });
```
The GET-serving `app/admin/setup/page.tsx` must run the identical `exists` check server-side (RSC `await`), so the *page* also 404s — not just the POST.

Password hashing uses `@node-rs/argon2`, Argon2id, OWASP-2026 minimums (`memoryCost: 19_456, timeCost: 2, parallelism: 1`) — explicitly **not** bcrypt; `.planning/research/ARCHITECTURE.md`'s `-- bcrypt` schema comment is stale, superseded by `.claude/CLAUDE.md`.

### Write path + durability — `app/api/chat/messages/route.ts`, `app/api/admin/messages/route.ts`, `src/server/repo/messages.ts`, `src/server/repo/conversations.ts`

No RESEARCH.md code sample exists for this exact route (it's described narratively in the Architectural Responsibility Map and Anti-Patterns section, not as a code block) — build from the stated contract: persist original text and `pg_notify` in one transaction, DB is sole source of truth, **zero translation/OVH call in this write path in Phase 1**. Use `client_msg_id` for idempotency (mentioned under CHAT-03 in RESEARCH.md's Phase Requirements table, "Data Model below" — not included in the truncated read, but the idempotency-key requirement itself is explicit and load-bearing for D-18/D-19 optimistic-send retry).

### Rate limiting — `src/server/repo/ratelimit.ts`

**Reference:** RESEARCH.md Pattern 7 (lines ~529-547) — single atomic `INSERT ... ON CONFLICT DO UPDATE ... WHERE` statement, race-free under Postgres row locking, no SELECT-then-UPDATE round trip. Marked `[ASSUMED]` by the researcher (general Postgres token-bucket pattern, not cross-checked against an authoritative cookbook) — low risk, standard shape, but verify the SQL against the actual Drizzle schema column names at execution time. Check both `v:<visitor_id>` and `ip:<hmac>` keys per send.

### Migrations / boot — `scripts/migrate.mjs`, `Dockerfile`

**Reference:** RESEARCH.md Pattern 8 (lines ~549-562) and `.claude/CLAUDE.md` §1. Non-pooled `postgres(url, { max: 1 })` client, `drizzle-orm/postgres-js/migrator`, run via `CMD ["sh","-c","node ./scripts/migrate.mjs && node server.js"]`. Copy `.next/static`, `public/`, and `drizzle/` manually into the standalone output — the standalone trace does not include them.

### Translation spike — `scripts/translation-spike.mjs`

**Reference:** RESEARCH.md Pattern 6 (lines ~454-527) — full validator implementation (script-block regex table, refusal markers, length-ratio bounds, token-preservation check, round-trip translate function with structural prompt-injection isolation). This is a complete, copy-adaptable reference, not a stub — use it directly rather than re-deriving validators.

## Shared Patterns

### SSE header/response shape
**Source:** RESEARCH.md Pattern 2.
**Apply to:** `app/api/chat/stream/route.ts`, `app/api/admin/stream/route.ts`
```ts
headers: {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
}
```
Every emitted SSE event must carry `id: <messages.id>` — omitting it silently breaks `Last-Event-ID` replay (RESEARCH.md Anti-Patterns, Pitfall 6). Heartbeat every 20-25s (`: ping\n\n`) pending Traefik idle-timeout verification on first deploy.

### Session cookie signing
**Source:** RESEARCH.md Pattern 3.
**Apply to:** `src/server/auth/session.ts`, `app/api/admin/login/route.ts`, `proxy.ts`, visitor-cookie issuance in `app/api/chat/*`
One `jose` `SignJWT`/`jwtVerify` instance, one `SESSION_SECRET` env var, cookies distinguished by `typ` claim only.

### Zod validation on every write route
**Source:** RESEARCH.md Standard Stack table + Don't Hand-Roll table (no code sample yet in repo — greenfield).
**Apply to:** `app/api/chat/messages/route.ts`, `app/api/chat/prefs/route.ts`, `app/api/admin/messages/route.ts`, `app/api/admin/setup/route.ts`, `app/api/admin/login/route.ts`
Every public write handler is unauthenticated input; parse with a zod schema at the top of the handler before touching the DB.

### Driver discipline (don't hand-roll reconnect)
**Source:** RESEARCH.md "Don't Hand-Roll" table + Anti-Patterns.
**Apply to:** `src/server/db/listener.ts` only
Do not import `pg`'s `Client` anywhere in this phase; `sql.listen()` already owns reconnect/backoff/replay-hook. Presence of `import { Client } from 'pg'` anywhere is a warning sign per RESEARCH.md Pitfall 1.

## No Analog Found

All 30 files listed above have no in-repo analog — this is expected and documented, not a gap. Planner should treat RESEARCH.md's numbered Patterns 1-8 (and their exact line ranges cited above) as the primary reference material for each corresponding plan, supplemented by `.claude/CLAUDE.md`'s locked stack decisions where RESEARCH.md is silent (e.g., Dockerfile specifics, standalone-copy steps).

| File cluster | Role | Data Flow | Reason |
|---|---|---|---|
| All 30 files above | various | various | Repository is greenfield — verified via direct directory listing at mapping time (2026-07-20); no `package.json`, `src/`, or prior commits containing application code exist |

## Metadata

**Analog search scope:** Full working tree (`D:\Work\Dev\Projects\Personal\followup\web`), confirmed via `ls -la` and `find . -maxdepth 2` excluding `.git`/`.planning`.
**Files scanned:** 5 non-planning filesystem entries (`.claude/`, `.git/`, `.gitignore`, `.planning/`, `PRD-chat-site.md`) — none are source code.
**Pattern extraction date:** 2026-07-20
**Primary substitute sources used in place of analogs:** `.planning/phases/01-foundation-and-the-realtime-spine/01-RESEARCH.md` (Patterns 1-8, Context7-verified library usage), `.claude/CLAUDE.md` (locked stack + Docker/Coolify integration details)
</content>
