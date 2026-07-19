<!-- GSD:project-start source:PROJECT.md -->

## Project

**One Chat**

A website that is not a website in the traditional sense — no pages, no menus, no marketing sections. The URL opens straight into a single, full-screen, one-on-one chat with a real human (the owner), in the visitor's own language and preferred light/dark appearance. It exists to give people curious about Christ — often first-time hearers — a safe, personal place to talk, ask, and if they choose, take a step of faith, with follow-up happening in that same conversation.

Visitors are fully anonymous: no accounts, no logins, no name, email, or phone. They are recognized only by a random ID in their own browser and reached again only via browser push. The owner runs everything from a separate, password-protected Admin Dashboard.

**Core Value:** A person opens the URL and, within seconds, is in a warm conversation with a real human being in their own language — and can always be reached again when that human replies.

### Constraints

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

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js** | `24.18.x` (Krypton, Active LTS) | Runtime; base image `node:24-alpine` | Node 24 is the current Active LTS (released line, 24.18.0 on 2026-06-23). Next.js 16 requires `>=20.9.0`; 24 is the safe LTS with the longest remaining support. Do **not** use Node 26 — it is Current, not LTS. |
| **Next.js** | `16.2.10` | App Router, API routes, SSE, admin + visitor UI in one deployable | Latest stable (published 2026-07-01). `output: 'standalone'` is a first-class documented Docker target and emits a `server.js` that honours `PORT`, `HOSTNAME`, `KEEP_ALIVE_TIMEOUT`. |
| **React / React DOM** | `19.2.7` | UI | Next 16 peer range is `^18.2.0 \|\| ^19.0.0`. React 19 is the default for new Next 16 apps; no reason to stay on 18. |
| **TypeScript** | **`6.0.3`** — pin exactly, do **not** take `latest` | Types | ⚠️ **`typescript@latest` is now 7.0.2** (Go-native compiler, GA 2026-07-08). TS 7 dropped `lib/typescript.js` (the JS Compiler API); `lib/` is now a shim delegating to a native binary. **This breaks Next.js TypeScript detection.** Next.js support for TS 7 landed only in **16.3 preview** behind `experimental.useTypeScriptCli`. On Next 16.2.x you must pin TS 6.0.3. Revisit when Next 16.3 is stable. |
| **PostgreSQL** | `17.x` (Coolify default modern line) | Storage + `LISTEN/NOTIFY` transport | Already the realtime bus by decision. 17 is fine; nothing in this stack needs 18. Pin the image tag — Coolify's Postgres docs warn about `pg_dump` format drift across majors when restoring backups. |
| **Drizzle ORM** | `0.45.2` | Schema, queries, types | `latest` dist-tag = 0.45.2 (2026-03-27). **Drizzle 1.0 is in RC** (`1.0.0-rc.4` on the `rc` tag) with a large beta/RC churn history. Ship on 0.45.2; do not take `1.0.0-rc.*` for a project that must be stable on day one. |
| **drizzle-kit** | `0.31.10` | Migration generation (`drizzle-kit generate`) | Dev-only. Generates SQL files you commit and apply at container start — see the standalone trap below. |
| **postgres (postgres.js)** | `3.4.9` | Postgres driver — **both** the query pool and the LISTEN connection | See "The LISTEN/NOTIFY driver decision" below. This is a deviation from the assumed `pg` and it removes ~100 lines of reconnect code. |
| **openai** | `6.48.0` | OpenAI-compatible client pointed at OVHcloud AI Endpoints | Latest (2026-07-17). Configure `new OpenAI({ baseURL, apiKey })`. Set `maxRetries` explicitly — the SDK retries 429 with backoff, which is exactly the 429 handling the PRD requires. |
| **web-push** | `3.6.7` | VAPID-signed push delivery | Only real option for self-hosted VAPID push from Node. See maintenance caveat below. |
| **jose** | `6.2.3` | Signed session cookie (JWT/JWS) | Latest (2026-04-27). Pure Web Crypto, no native deps, works in both Node and edge. Correct call. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@node-rs/argon2** | `2.0.2` | Admin password hashing | **Recommended replacement for bcrypt.** N-API prebuilt binaries (incl. musl/Alpine) — no node-gyp, no build-tools layer in the Dockerfile. |
| **bcryptjs** | `3.0.3` | Fallback if you insist on bcrypt | Pure JS, zero native deps. Use this rather than `bcrypt@6.0.0` if the bcrypt decision stands. |
| **zod** | `4.4.3` | Request body validation on API routes | Every public route handler (visitor message POST, push subscribe) needs a schema. Anonymous + unauthenticated = untrusted input on every byte. |
| **tailwindcss** | `4.3.3` | Styling, RTL via logical properties | v4 has first-class logical-property utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start/end`) — exactly what the "one stylesheet, both directions" decision needs. No `tailwindcss-rtl` plugin required. |
| **pino** | `10.3.1` | Structured logs to stdout for Coolify's log view | Optional but cheap. Redact message bodies — pastoral content must not land in logs. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `drizzle-kit generate` | Emit SQL migrations to `./drizzle` | Commit the SQL. Never use `drizzle-kit push` against production. |
| `web-push generate-vapid-keys` | One-time VAPID keypair | `npx web-push generate-vapid-keys`. Store private key as a Coolify **runtime-only** env var; public key must be a **build-time** var (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`) because the client bundle inlines it. |
| Docker BuildKit multi-stage | Image build | `deps → builder → runner`, `runner` is `node:24-alpine` with a non-root `nextjs` user. |
| Coolify healthcheck | Container liveness | Point at `GET /api/health` returning 200 + a trivial `SELECT 1`. |

## Installation

# Core

# Data

# Auth / push / translation

# Validation + UI

# Dev

## Integration Details for the Locked Decisions

### 1. Next.js standalone Docker build for Coolify

# syntax=docker/dockerfile:1

# Build-time ONLY. Anything NEXT_PUBLIC_* must exist here or it is baked as undefined.

# CRITICAL: standalone tracing does NOT include your migration SQL

- `server.js` is generated by Next at build time and reads `PORT`, `HOSTNAME` (default `0.0.0.0`) and `KEEP_ALIVE_TIMEOUT` from env at start. It also does `process.chdir(__dirname)` — so relative paths at runtime resolve against the standalone root, which is why `drizzle/` must be copied into `/app/drizzle`, not left in the builder.
- **`.next/static` and `public` are not copied by the standalone trace.** You copy them manually (above). Missing this yields a site with no CSS and no JS chunks — the classic "it built fine but the page is unstyled" symptom.
- **Build-time vs runtime env in Coolify:** Coolify keeps two independent flags per variable. *Build* variables become `ARG`s (stored in `/artifacts/build-time.env`, outside the build context). *Runtime* variables are written to a `.env` loaded by `env_file` at container start. Both default to on. Mark `VAPID_PRIVATE_KEY`, `DATABASE_URL`, `OVH_API_KEY`, `SESSION_SECRET` as **runtime-only** (uncheck build) so they never enter an image layer. Mark `NEXT_PUBLIC_VAPID_PUBLIC_KEY` as **build** (it must be inlined).
- **Any `NEXT_PUBLIC_*` change requires a rebuild, not a restart.** This bites people once per project.
- Set `Ports Exposes = 3000` in the Coolify application settings when using a Dockerfile build pack. Coolify's Next.js doc recommends Nixpacks; **ignore that** — use Dockerfile, you need control over the standalone copy steps and the migration folder.
- Run migrations at container start, not at build: `CMD ["sh","-c","node ./scripts/migrate.mjs && node server.js"]`, where the script uses `drizzle-orm/postgres-js/migrator`. Build-time migration is impossible anyway — the DB isn't reachable from the builder.
- **Health check:** add `app/api/health/route.ts` with `export const dynamic = 'force-dynamic'`, do a `SELECT 1`, return 200/503. Configure it as the Coolify healthcheck path. Keep it out of any auth middleware/proxy matcher.

### 2. SSE in Next.js 16 App Router route handlers

- **`export const dynamic = 'force-dynamic'` is load-bearing.** In Next's app-route module, without it a route matching the prerender manifest is treated as ISR and **its response is fully buffered** — your SSE stream silently becomes a single blob delivered on close. This is the single most common "SSE doesn't work in Next" cause.
- **Cancellation:** `req.signal` (`NextRequest`/`Request`) fires `abort` when the client disconnects. This is your *only* reliable hook to release the Postgres listener. Also check `req.signal.aborted` before returning, for the race where the client is already gone.
- **Compression buffers streams.** Next's built-in gzip/brotli accumulates before flushing. Either set `compress: false` in `next.config.ts` (fine — Traefik/Coolify can compress static assets), or rely on `Cache-Control: no-transform` + `X-Accel-Buffering: no`. For a chat app, `compress: false` is the pragmatic call: your payloads are tiny.
- **`X-Accel-Buffering: no`** is nginx-specific but harmless elsewhere; include it because Coolify users often front the stack with an extra nginx.
- **Traefik (Coolify's default proxy) is the risk.** There are open Coolify reports of SSE/WebSocket connections being unreliable behind Traefik in production while working in plain Docker Compose (coollabsio/coolify#4002 — still open, no confirmed fix), plus a Traefik 3.6 long-connection 408-after-~5-minutes class of bug (coollabsio/coolify#8298). **Design for the stream dying.** Concretely:
- **HTTP/1.1 6-connection limit:** over HTTP/1.1 a browser allows 6 connections per origin; one long-lived SSE stream eats one. Coolify terminates TLS with HTTP/2 by default, which removes this, but note it for local dev over plain HTTP.

### 3. The `LISTEN/NOTIFY` driver decision — deviate from `pg`

- `sql.listen()` opens and maintains a **dedicated connection outside the pool**, with automatic backoff reconnect.
- The third `onlisten` callback fires on initial connect *and on every reconnect* — the documented idiom for "run pending jobs". That is precisely your gap-fill hook.
- `unlisten()` in the SSE `abort` handler is the leak fix. Call it in the same `cleanup()` as `clearInterval`.
- Drizzle supports this driver directly: `drizzle-orm/postgres-js`. Peer dep `postgres: ">=3"` is declared in drizzle-orm 0.45.2.
- **8000-byte payload limit** on `pg_notify`. Never send message bodies — send `{ conversationId, messageId }` and let the SSE handler `SELECT` the row. This also keeps pastoral content out of Postgres server logs.
- **NOTIFY is transactional.** Notifications fire at COMMIT, not at statement time. Use `SELECT pg_notify(...)` inside the same transaction as the insert; the listener will never see an ID that isn't committed yet.
- **Channel names are identifiers** — 63-byte limit, and they are lowercased unless quoted. Use `conv_<uuid-with-dashes-stripped>` or a single `messages` channel with the conversation id in the payload. For a single-owner app, **one global channel plus server-side filtering is simpler and cheaper** than N per-conversation LISTENs; the admin dashboard wants the firehose anyway.
- **Notifications are not durable.** Anything sent while nobody is listening is gone. The `onlisten` replay + `Last-Event-ID` are what satisfy "no message is ever lost".

### 4. web-push + service worker

- **Key generation:** `npx web-push generate-vapid-keys` → `{ publicKey, privateKey }` (URL-safe base64). Generate **once**; rotating invalidates every existing subscription, which for this product means losing every visitor permanently. Treat the private key as the single most operationally critical secret in the project — back it up outside Coolify.
- `setVapidDetails('mailto:owner@domain', PUBLIC, PRIVATE)` once at module scope in a server-only module. The subject must be a real `mailto:` or `https:` URL — Mozilla's push service rejects malformed subjects.
- **Subscription lifecycle / 410 handling** — the exact contract:
- **The subscription is not stable.** Browsers silently rotate endpoints. The client must call `registration.pushManager.getSubscription()` on **every** app open, compare the endpoint to what the server has, and re-POST if changed. Without this, the "reach them again" core value quietly decays. Also handle the `pushsubscriptionchange` service worker event (Chrome fires it; Safari does not reliably).
- **Schema implication:** unique index on `endpoint`, not on visitor id — one visitor can have several browsers/devices. Store `endpoint`, `p256dh`, `auth`, `visitor_id`, `created_at`, `last_success_at`, `failure_count`.
- **`TTL`**: default is four weeks. For "you have a new reply" set `TTL: 86400` and `urgency: 'high'`. Use `topic` (≤32 URL-safe base64 chars) so multiple unread replies coalesce into one notification instead of stacking.
- **iOS is the constraint that shapes the UI** (already captured in PROJECT.md): Safari only allows `Notification.requestPermission()` from a user gesture inside an **installed** (Add to Home Screen) PWA. This means you need `public/manifest.json` with `display: "standalone"`, correct icons, and the guided install screen *before* the permission prompt. There is no way around it.
- **Service worker:** write `public/sw.js` by hand. It needs exactly two handlers (`push`, `notificationclick`) plus `skipWaiting`/`clients.claim`. Do **not** pull in `next-pwa` (5.6.0, unmaintained, Next 13-era) — and Serwist (`9.5.11`) is a fine project but is a Workbox-scale precaching toolchain you do not need for two event handlers. Hand-written SW = no build-step coupling, and it lands in `public/` which the Dockerfile already copies.
- **Scope:** `public/sw.js` registers at scope `/` automatically. Serve it with `Cache-Control: no-cache` (add a header rule in `next.config.ts`) or you will ship an un-updatable service worker.
- **web-push maintenance status (be aware, not alarmed):** npm `latest` is **3.6.7, published 2024-01-16** — two and a half years stale. The GitHub repo is *not* abandoned (commits through 2026-07-14: ESLint 10 upgrade, dep drops, CI Node bump), it just hasn't cut a release. 3.6.7 works on Node 24 and is CommonJS/Node-only (no edge runtime). Accept it; there is no better maintained alternative for VAPID from Node. If you ever need edge, `@block65/webcrypto-web-push` is the Web Crypto alternative.

### 5. Translation via OpenAI SDK → OVHcloud

- `openai@6.48.0`, `new OpenAI({ baseURL: process.env.OVH_BASE_URL, apiKey: process.env.OVH_API_KEY, maxRetries: 3, timeout: 20_000 })`.
- Model IDs must come from an env var / config table, never a string literal — PROJECT.md already flags catalog-vs-`GET /v1/models` drift.
- `temperature: 0`, and put the target language in the **system** message with an explicit "output only the translation, no preamble" instruction. Chat models otherwise prepend "Sure, here's the translation:".
- Cache by `sha256(sourceText + sourceLang + targetLang + modelId)` in a `translations` table. Owner replies get previewed before send, so the same string is often translated twice — the cache pays for itself immediately.
- Wrap every call so a translation failure **never** blocks message persistence. Store the original, mark `translation_status = 'pending'`, retry out-of-band. Use Next's stable `after()` API to run translation after the response is flushed so the visitor's send feels instant.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `postgres` (postgres.js) 3.4.9 | `pg` 8.22.0 | If you need the wider ecosystem (`pg-boss`, RDS IAM auth, `pgvector` helpers) or you are more comfortable with the callback-style API. You then own the LISTEN reconnect + replay code. |
| Drizzle 0.45.2 | Drizzle `1.0.0-rc.4` | Only after 1.0 goes stable. Revisit at the milestone boundary — the RQB v2 improvements are real, the RC churn is not worth it pre-launch. |
| `@node-rs/argon2` | `bcryptjs` 3.0.3 | If the bcrypt decision is immovable. Pure JS, no native build. |
| `@node-rs/argon2` | `argon2` 0.45.0 | Only if you need the exact node-argon2 API. It is node-gyp-based; you'll add build-base/python to the builder stage. |
| Hand-written `public/sw.js` | Serwist 9.5.11 | If you later add offline caching of the chat shell / background sync of queued messages. Then Serwist earns its keep. Not for v1. |
| Postgres `LISTEN/NOTIFY` | Postgres logical replication / a durable queue | Only when you outgrow a single app container. NOTIFY does not fan out across replicas — see the scaling note below. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`typescript@latest` (7.0.2)** | Ships the Go-native compiler without `lib/typescript.js`; Next.js 16.2 cannot detect/invoke it. Support is 16.3-preview-only behind `experimental.useTypeScriptCli`. It also ships without a stable programmatic API, so other tooling may break too. | `typescript@6.0.3`, pinned exactly |
| **`bcrypt` (npm) 6.0.0** | Two problems. (a) OWASP now says bcrypt "should only be used for password storage in **legacy systems** where Argon2 and scrypt are not available" — Argon2id is the recommendation for new applications (m=19456, t=2, p=1 minimum). (b) It is a node-gyp native module: you need build tools in the builder stage, and a glibc-builder → musl-runner mismatch produces a runtime `invalid ELF header`. | `@node-rs/argon2@2.0.2` (prebuilt musl binaries). If bcrypt must stay: `bcryptjs@3.0.3`, cost ≥ 12, and remember the **72-byte** input truncation. |
| **`pg.Pool` for `LISTEN`** | `LISTEN` is session state on one connection. A pool recycles or reassigns that socket and notifications stop arriving with **no error** — the worst failure mode. | `sql.listen()` (postgres.js) or a dedicated non-pooled `pg.Client` with hand-rolled reconnect |
| **Omitting `dynamic = 'force-dynamic'` on the SSE route** | Route is treated as ISR and the response is fully buffered; the stream delivers nothing until close. | `export const dynamic = 'force-dynamic'` |
| **`next-pwa` 5.6.0** | Last published for the Next 13 era; incompatible with App Router build output in Next 16 and effectively unmaintained. | Hand-written `public/sw.js`, or Serwist if you truly need Workbox |
| **Coolify Nixpacks build pack for this app** | You need explicit control of `.next/static`, `public/`, and the `drizzle/` migration folder in the final image, plus a migrate-then-start command. Nixpacks hides all of it. | Dockerfile build pack, `Ports Exposes = 3000` |
| **NextAuth / Auth.js** | Correctly excluded. For one user it is a large dependency, a DB adapter, and a callback surface to secure, in exchange for nothing. | `jose` HS256/EdDSA signed cookie, `httpOnly`, `secure`, `sameSite: 'lax'`, `__Host-` prefix |
| **`Meta-Llama-3_3-70B-Instruct`** | Does not officially cover Arabic, Chinese, Russian, Indonesian, or Swahili (verified 2026-07-20) | `Qwen3.6-27B` / `Qwen3.5-397B-A17B` |
| **Multi-replica deployment of the app container (v1)** | `NOTIFY` reaches every listening connection, so multiple replicas each get every event — that part is fine. But sticky-session-free SSE plus per-replica in-memory presence state is not. | Single replica. Revisit only when adding responders. |
| **Logging message bodies** | Pastoral/faith content under a no-personal-data promise. Coolify's log viewer is not a confidential store. | Log ids and status codes only; `pino` with a redact list |

## Stack Patterns by Variant

- Keep the OpenAI SDK client behind a `TranslationProvider` interface with a per-language provider map in config.
- Adding a second provider for one language then costs a config row, not a refactor. Do this in Phase 1 regardless of the spike outcome — it is ~30 lines.
- Fall back to short-lived SSE (4-minute server-side close + `Last-Event-ID` replay) — recommended as the *default* anyway.
- Second fallback: 3–5 second polling of `/api/messages?since=<id>`. For a single-responder chat this is genuinely adequate and removes the whole class of proxy problems. Keep the `since=` endpoint in the API surface from day one so this fallback is a client-side flag, not a rewrite.
- One global `messages` NOTIFY channel + per-connection server-side filtering already supports this.
- Presence must move out of process memory into a `responders` table before the second replica exists.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.2.10` | `node >=20.9.0` | Use `node:24-alpine`. Node 26 is Current, not LTS — avoid. |
| `next@16.2.10` | `react@19.2.7`, `react-dom@19.2.7` | Peer range `^18.2.0 \|\| ^19.0.0`. Keep react and react-dom on the identical version. |
| `next@16.2.10` | `typescript@6.0.3` | **Incompatible with `typescript@7.x`** until Next 16.3 (`experimental.useTypeScriptCli`). |
| `drizzle-orm@0.45.2` | `postgres@>=3` | Declared peer. Import from `drizzle-orm/postgres-js`. |
| `drizzle-orm@0.45.2` | `drizzle-kit@0.31.10` | Matching stable pair. Do not mix with `drizzle-orm@1.0.0-rc.*`. |
| `web-push@3.6.7` | Node 24, CommonJS, **Node runtime only** | Any route handler that calls it needs `export const runtime = 'nodejs'`. Add `@types/web-push`. |
| `jose@6.2.3` | Node 24 + edge | Web Crypto based; no native deps; safe in `proxy.ts`. |
| `tailwindcss@4.3.3` | Next 16 App Router | Use `@tailwindcss/postcss`, not the v3 `tailwindcss` PostCSS plugin. |

## Next.js 16 Migration Notes (greenfield, but these shape the code you write)

- **`middleware.ts` → `proxy.ts`.** The filename and the named export are both renamed (`export function proxy(request)`). `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`. **The `edge` runtime is NOT supported in `proxy`** — it is `nodejs` and not configurable. For admin route protection this is good news: you can read the DB from `proxy.ts` if you want (though verifying the `jose` cookie signature without a DB hit is better).
- **Async request APIs are now mandatory.** `cookies()`, `headers()`, `draftMode()`, `params`, `searchParams` are async-only in 16; the Next 15 sync compatibility shim is fully removed. Every admin page and route handler must `await` them.
- **`after()`** is the right place for translation calls and push sends — work that must happen but must not delay the response.

## Sources

- npm registry (`registry.npmjs.org`) — all version numbers and publish dates, fetched 2026-07-20. **HIGH**
- nodejs.org/dist/index.json — LTS lines, fetched 2026-07-20. **HIGH**
- Context7 `/vercel/next.js/v16.2.9` — standalone `server.js` generation source, `output` docs, streaming/ReadableStream route handler docs, `force-dynamic` + ISR buffering behaviour in `app-route/module.ts`, request abort signal test, v16 upgrade guide (proxy, async APIs). **HIGH**
- Context7 `/porsager/postgres` — `sql.listen()` dedicated-connection + auto-reconnect + `onlisten` semantics. **HIGH**
- Context7 `/web-push-libs/web-push` — `generateVAPIDKeys`, `setVapidDetails`, `sendNotification` options and 404/410/429 handling. **HIGH**
- GitHub API `web-push-libs/web-push` — commit activity through 2026-07-14 vs last npm release 2024-01-16. **HIGH**
- coolify.io/docs/knowledge-base/environment-variables — build vs runtime variable flags, `/artifacts/build-time.env`, shared variable syntax. **HIGH**
- coolify.io/docs/applications/nextjs — `Ports Exposes = 3000`, Dockerfile vs Nixpacks. **MEDIUM** (thin doc)
- coollabsio/coolify issue #4002 (SSE/WebSocket unreliable behind Traefik, still open) and #8298 (Traefik 3.6 long-connection 408) — **MEDIUM**, community reports without confirmed fixes; treated as risk, mitigated by design
- Coolify "Connect To Predefined Network" requirement — community write-ups + coollabsio/coolify discussion #8322. **MEDIUM**, corroborated across independent sources
- devblogs.microsoft.com "Announcing TypeScript 7.0" + vercel/next.js discussion #95633 (TS 7 support, `experimental.useTypeScriptCli`, Next 16.3 preview). **HIGH**
- OWASP Password Storage Cheat Sheet — Argon2id for new applications, bcrypt for legacy systems, 72-byte limit. **HIGH**

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
