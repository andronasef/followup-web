# Walking Skeleton — One Chat

**Phase:** 1
**Generated:** 2026-07-20

## Capability Proven End-to-End

A fresh visitor can load the deployed app, the server can prove a real read+write round trip against Postgres through the exact schema the whole product builds on, and `/api/health` reports 200 — proving Next.js 16 (standalone), Drizzle + postgres.js, and the container/migration boot sequence are wired together before any chat logic is built on top.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.2.10, App Router, `output: 'standalone'` | Locked in `.claude/CLAUDE.md`; single deployable, first-class Docker target |
| Language | TypeScript 6.0.3 (pinned exact, never `latest`) | TS 7.0.2 dropped `lib/typescript.js` and breaks Next 16.2's TS detection |
| Data layer | Postgres 17 + Drizzle ORM 0.45.2 via `drizzle-orm/postgres-js`, driver `postgres@3.4.9` | `sql.listen()` gives dedicated-connection LISTEN + auto-reconnect for free; Drizzle is the single schema source of truth |
| Migrations | `drizzle-kit generate` (dev) → committed SQL in `./drizzle` → `drizzle-orm/postgres-js/migrator` applied by `scripts/migrate.mjs` at container start | `drizzle-kit push` against production is forbidden by the locked stack doc |
| Auth | `jose` (HS256 signed HttpOnly cookies) for both visitor identity and owner session; `@node-rs/argon2` (Argon2id) for the owner password | No NextAuth — exactly one owner user; Argon2id per OWASP 2026, not bcrypt (Alpine build risk) |
| Styling | Tailwind v4 (`@theme inline`, no `tailwind.config.*`) + shadcn (`--base radix --rtl`) | `--rtl` pulls Radix RTL fixes load-bearing for LANG-03; system font stack, no webfont (privacy + no-FOUT) |
| Realtime | Postgres `LISTEN/NOTIFY` (one dedicated `sql.listen()` connection, `max:1`) → in-process hub → SSE (`ReadableStream`, `dynamic = 'force-dynamic'`) | No Pusher/socket.io; `messages.id` is both the SSE event id and the `Last-Event-ID` replay cursor |
| Deployment target | Self-hosted Docker on Coolify, Dockerfile build pack (not Nixpacks), `Ports Exposes = 3000` | Owner controls infrastructure; Coolify's Nixpacks path hides the standalone-copy + migration-at-start steps this app needs |
| Directory layout | Everything under `src/`: `src/app/**` (routes), `src/server/**` (db, auth, realtime, repo, i18n — server-only), `src/lib/**` (shared client+server utils, i18n locale JSON), `src/components/**` (chat/admin UI); root-level `drizzle/`, `scripts/`, `public/` | Matches `01-RESEARCH.md`'s "Recommended Project Structure" tree exactly — no in-repo analogs exist yet, so this tree is the canonical layout, not a convention discovered from code |

## Stack Touched in Phase 1

- [x] Project scaffold — Next.js 16 + TypeScript 6.0.3 + Tailwind v4 + shadcn (`--rtl`), pinned `package.json`, `npm run dev`/`npm run build` both succeed
- [x] Routing — `/` (visitor chat), `/admin/*` (owner surface), `/api/health`, `/api/chat/*`, `/api/admin/*`
- [x] Database — full 7-table schema (`visitors`, `conversations`, `messages`, `responders`, `push_subscriptions`, `message_translations`, `rate_limit_buckets`) migrated via `drizzle-kit generate` + `scripts/migrate.mjs`; `/api/health` performs a real `SELECT 1`
- [x] UI — the visitor chat is a real interactive surface (composer, send, receive) built across later plans in this phase, not deferred past Phase 1
- [x] Deployment — `docker compose up -d db` + `npm run dev` is the documented local full-stack run command (Plan 01-01); a real Coolify container deploy with migrations-at-start closes out the phase (Plan 01-13)

## Out of Scope (Deferred to Later Slices)

- Real push permission gate, service-worker push handling, VAPID — Phase 2. Phase 1 ships only an env-bypassed `<Gate>` shell and a registration-only `sw.js` stub.
- Translation runtime (worker, cache, owner draft preview) — Phase 2. Phase 1's OVH call happens exactly once, inside the standalone `scripts/translation-spike.mjs`, never inside the running app.
- Owner presence *toggle*, prioritized inbox, filters/search/counts, status/faith-decision controls, block/delete, crisis resources, admin lockout, restore drill — Phase 3.
- `Qwen3.6-27B` cost/latency comparison — left open per D-04.

## Subsequent Slice Plan

Within this phase, every plan after 01-01 adds one slice on top of this skeleton without renegotiating the decisions above:

- 01-02: Translation spike (FOUND-01) — standalone, gates the locale-file language list
- 01-03 – 01-05: Realtime/data core, auth primitives, i18n foundation
- 01-06 – 01-08: Visitor identity, owner auth wiring, realtime routes + message durability
- 01-09 – 01-11: Visitor chat UI, composer/message list/realtime client, admin UI
- 01-12: Final visitor page wiring
- 01-13: Dockerize + Coolify deploy, OPS-06/OPS-09 verification

Phase 2 and Phase 3 build their vertical slices on this same schema, auth, and realtime spine without altering it.
