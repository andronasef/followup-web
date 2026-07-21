// Full Phase 1 schema — 7 tables. See 01-01-PLAN.md and 01-RESEARCH.md's
// Data Model for the shape rationale. Two tables (push_subscriptions,
// message_translations) are schema-only this phase — nothing writes to them
// until Phase 2. The `responders` table and `conversations
// .assignedResponderId` exist from day one per FOUND-03, even though
// nothing writes a non-null assignment value yet.
//
// ID-05 (privacy): no column anywhere in this file may store a name, email,
// phone number, or raw IP address for a *visitor*. `responders.email` is the
// single owner's login, not visitor PII.
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const visitors = pgTable("visitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  lang: text("lang"),
  appearance: text("appearance"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// The single owner (and, later, additional responders — FOUND-03).
export const responders = pgTable("responders", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  isOnline: boolean("is_online").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id),
    status: text("status").notNull().default("new"),
    // FOUND-03: forward-compatible assignment column. Nothing in Phase 1
    // ever writes a non-null value here.
    assignedResponderId: integer("assigned_responder_id").references(() => responders.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    // CHAT-08: resolves "the" open conversation for a returning visitor —
    // at most one non-closed conversation per visitor.
    uniqueIndex("conversations_open_visitor_idx")
      .on(table.visitorId)
      .where(sql`${table.status} <> 'closed'`),
    check("conversations_status_check", sql`${table.status} in ('new', 'in_progress', 'closed')`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    // bigserial: this id doubles as the SSE event id and the Last-Event-ID
    // replay cursor (CHAT-07) — must be a monotonic integer, never a uuid.
    id: bigserial("id", { mode: "number" }).primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id),
    sender: text("sender").notNull(),
    body: text("body").notNull(),
    // Send idempotency — lets a retried POST from the composer be a no-op.
    clientMsgId: text("client_msg_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    // PUSH-08: durable ACK marker set once a push-woken client confirms
    // receipt of this message. Starts null; never defaulted.
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => [check("messages_sender_check", sql`${table.sender} in ('visitor', 'owner')`)],
);

// Schema only this phase — Phase 2 writes here (push send/receive).
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  visitorId: uuid("visitor_id")
    .notNull()
    .references(() => visitors.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  failureCount: integer("failure_count").notNull().default(0),
});

// Schema only this phase — Phase 2 writes here (translation worker).
export const messageTranslations = pgTable(
  "message_translations",
  {
    id: serial("id").primaryKey(),
    messageId: bigint("message_id", { mode: "number" })
      .notNull()
      .references(() => messages.id),
    targetLang: text("target_lang").notNull(),
    translatedText: text("translated_text"),
    status: text("status").notNull().default("pending"),
  },
  (table) => [
    // Prevents duplicate in-flight/completed translations of the same
    // message into the same target language (e.g. a retried translation
    // job racing the original).
    uniqueIndex("message_translations_message_lang_idx").on(table.messageId, table.targetLang),
  ],
);

// PUSH-01/OPS-11: per-visitor, per-platform push-gate funnel state. Each
// stage timestamp is set at most once (COALESCE-based upsert in
// server/repo/gateFunnel.ts) -- concurrent/repeated calls are idempotent and
// never overwrite an already-recorded stage.
export const pushGateFunnel = pgTable(
  "push_gate_funnel",
  {
    visitorId: uuid("visitor_id")
      .notNull()
      .primaryKey()
      .references(() => visitors.id),
    platform: text("platform").notNull(),
    shownAt: timestamp("shown_at", { withTimezone: true }),
    promptReachedAt: timestamp("prompt_reached_at", { withTimezone: true }),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
  },
  (table) => [
    check("push_gate_funnel_platform_check", sql`${table.platform} in ('ios', 'other')`),
  ],
);

// OPS-01 — Postgres-native token bucket, race-free via the ON CONFLICT
// upsert in server/repo/ratelimit.ts. `key` is 'v:<visitor_uuid>' or
// 'ip:<hmac-hex>' — never a raw IP (ID-05).
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  tokens: real("tokens").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});
