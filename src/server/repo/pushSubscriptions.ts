// PUSH-10/PUSH-11: push subscription lifecycle. `endpoint` is the natural
// key (browsers silently rotate endpoints -- .claude/CLAUDE.md "Subscription
// lifecycle"), never `visitor_id` -- one visitor can have several
// browsers/devices, so create() upserts on endpoint rather than erroring on
// a re-subscribe.
import { eq, sql as rawSql } from "drizzle-orm";
import { db } from "../db/pool.ts";
import { pushSubscriptions } from "../db/schema.ts";

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

/**
 * Creates a new push subscription, or updates the existing row in place if
 * `endpoint` already exists (PUSH-11's re-sync can re-POST an unchanged or
 * refreshed subscription -- this must never error on a duplicate endpoint).
 */
export async function create(
  visitorId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<PushSubscriptionRow> {
  const [row] = await db
    .insert(pushSubscriptions)
    .values({ visitorId, endpoint, p256dh, auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { visitorId, p256dh, auth },
    })
    .returning();
  return row;
}

/** PUSH-10: a push service's 404/410 response means the endpoint is dead --
 * delete it so future sends don't keep hitting a gone subscription. */
export async function deleteByEndpoint(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function listForVisitor(visitorId: string): Promise<PushSubscriptionRow[]> {
  return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.visitorId, visitorId));
}

/**
 * ID-03: looks up a subscription by its endpoint alone -- the general
 * lost-both-cookie-and-localStorage recovery path (Plan 02-06's
 * POST /api/push/recover). Returns null when no row matches, never
 * inventing a subscription/visitor from an unknown endpoint.
 */
export async function getByEndpoint(endpoint: string): Promise<PushSubscriptionRow | null> {
  const [row] = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).limit(1);
  return row ?? null;
}

export async function markSuccess(endpoint: string): Promise<void> {
  await db
    .update(pushSubscriptions)
    .set({ lastSuccessAt: new Date(), failureCount: 0 })
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

/** Increments failure_count in place (failure_count = failure_count + 1) --
 * a column-relative update, not read-then-write, so concurrent send
 * failures for the same subscription never race/lose an increment. */
export async function markFailure(endpoint: string): Promise<void> {
  await db
    .update(pushSubscriptions)
    .set({ failureCount: rawSql`${pushSubscriptions.failureCount} + 1` })
    .where(eq(pushSubscriptions.endpoint, endpoint));
}
