# syntax=docker/dockerfile:1
#
# Multi-stage build for Coolify (Dockerfile build pack, NOT Nixpacks --
# Nixpacks would hide the standalone-copy and migrate-at-start steps this
# app depends on; see .claude/CLAUDE.md "What NOT to Use").
#
# Stages: deps -> builder -> runner. Only `runner` ships; `deps`/`builder`
# exist purely to keep the final image small (no dev deps, no source tree,
# no node_modules beyond what `next build` traced into .next/standalone).

# ---------------------------------------------------------------------------
# deps: install exact dependency graph via package-lock.json
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# builder: full source + deps, produce the standalone build output
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# src/server/auth/session.ts throws at *module import time* if SESSION_SECRET
# is missing/short, and `next build`'s page-data-collection step imports
# every route module in a build-time Node process. This build ARG exists
# ONLY to satisfy that import-time check during the build -- it is never a
# real secret (it's a fixed 32-char placeholder, not a build-time value
# derived from the real Coolify runtime secret), it is not declared with
# NEXT_PUBLIC_ prefix so it is never inlined into client bundles, and this
# ENV assignment does not exist in the `runner` stage below -- the real
# SESSION_SECRET is read fresh from the container's runtime environment by
# server.js at container start (Coolify supplies it as a runtime-only var,
# per CLAUDE.md's build-time vs runtime distinction).
ARG SESSION_SECRET_BUILD_PLACEHOLDER="build-time-placeholder-not-a-real-secret-32"
ENV SESSION_SECRET=$SESSION_SECRET_BUILD_PLACEHOLDER

# src/server/push/vapid.ts throws at the same *module import time* if
# VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT are missing, for the same
# reason and via the same page-data-collection import chain as
# SESSION_SECRET above. Same fix, same scope: build-time-only placeholders,
# never real secrets, absent from the `runner` stage below -- the real
# values are supplied fresh at container start by Coolify's runtime env.
# Unlike SESSION_SECRET (any string >= 32 chars passes), web-push's
# setVapidDetails() shape-validates the public key as a real EC point, so
# the placeholder must be a syntactically valid (but never-used-for-real)
# VAPID keypair, not an arbitrary string.
# NEXT_PUBLIC_VAPID_PUBLIC_KEY is unrelated and NOT placeholdered here: it is
# inlined into the client bundle, so it must be the real public key at build
# time (a genuine Coolify build-time var, per CLAUDE.md), or push
# subscriptions will silently target the wrong keypair.
ARG VAPID_PUBLIC_KEY_BUILD_PLACEHOLDER="BPRDohqzHouQ1nRuP1Xcyk5sOaBE4ufTRHapAtV7XybfeJvrzTDf8dSHvHTd2JmspAy24qG_5PxID1qCztqFiJ8"
ARG VAPID_PRIVATE_KEY_BUILD_PLACEHOLDER="RtqI0GzetbwzoiUdy4-w1j3pFPNzZU01ODT93EW9ncw"
ENV VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY_BUILD_PLACEHOLDER
ENV VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY_BUILD_PLACEHOLDER
ENV VAPID_SUBJECT="mailto:build-placeholder@example.org"

# The real public key, inlined into the client bundle by `next build`. Must
# arrive as a build ARG (compose passes it via build.args) -- a runtime env
# var cannot reach browser code. Empty here means pushManager.subscribe()
# gets an empty applicationServerKey and the gate's Allow button no-ops.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

# output: "standalone" is set in next.config.ts (Plan 01-01).
# Fail the build rather than ship a bundle with an empty applicationServerKey
# -- the failure would otherwise be invisible until a visitor taps Allow.
RUN test -n "$NEXT_PUBLIC_VAPID_PUBLIC_KEY" \
  || (echo "NEXT_PUBLIC_VAPID_PUBLIC_KEY build arg is empty -- push would silently break" && exit 1) \
  && npm run build

# ---------------------------------------------------------------------------
# runner: minimal runtime image, non-root user, migrate-then-start CMD
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user -- Coolify/Docker best practice, avoids running the
# server process as root inside the container.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# The standalone trace includes only the node_modules subset next actually
# needs at runtime plus a generated server.js. It does NOT include
# .next/static, public/, or the drizzle/ migrations folder -- all three
# must be copied in manually or the app serves an unstyled page with no
# JS chunks (the classic standalone failure) and cannot migrate at start.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs

# migrate.mjs runs directly via `node`, outside Next's bundler -- unlike the
# app's own route handlers (which Turbopack inlines pure-JS deps like
# `postgres` directly into their compiled chunks), this script needs its
# imports to exist as real node_modules packages at runtime. Neither
# `postgres` nor `drizzle-orm` is part of the standalone trace above (it
# only traces what Next's own routes import), so both must be copied in
# manually from the `deps` stage. Both are zero-runtime-dependency packages
# (verified against package-lock.json), so no transitive closure is needed.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

USER nextjs

EXPOSE 3000

# Coolify's own healthcheck config (dashboard-configured, Task 3 of this
# plan) points at GET /api/health -- this HEALTHCHECK is a local/dev-time
# convenience so `docker run` and `docker compose` also self-report status.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Migrate-then-start, in the same shell invocation, every container start --
# not a separate manual step and not run at build time (the DB isn't
# reachable from the builder). server.js does process.chdir(__dirname) at
# start, so drizzle/ and scripts/ must live at this same WORKDIR root.
CMD ["sh", "-c", "node ./scripts/migrate.mjs && node server.js"]
