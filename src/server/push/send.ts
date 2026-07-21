// PUSH-08/PUSH-09/PUSH-10/D-13: the ACK-aware, 404/410-cleanup-aware live
// push sender. `next/headers`-free (same split rationale as subscribe.ts)
// -- triggered from Plan 02-06's admin/messages/route.ts after() hook, not
// from any next/headers-dependent module.
//
// Pitfall 5 (RESEARCH.md): this module is never awaited inside the
// durability-first write transaction -- callers invoke it from after() or
// equivalent post-response work, never from send.ts/reply.ts's own
// `db.transaction()` block.
import { webpush } from "./vapid.ts";
import { signVisitorId } from "../auth/session.ts";
import * as pushSubscriptions from "../repo/pushSubscriptions.ts";
import { getDeliveredAt } from "../repo/messages.ts";
import { getStrings } from "../../lib/i18n/strings.ts";
import type { SupportedLanguage } from "../i18n/detect.ts";

// Long enough for a foreground visitor's SSE-receipt-triggered ack round
// trip (PUSH-08's "short grace period"); short enough that a
// backgrounded/closed tab is still notified promptly.
export const ACK_GRACE_PERIOD_MS = 8_000;

/**
 * Same content-free shape subscribe.ts's Task 1 probe builds, extracted
 * here so both files share one definition rather than duplicating the
 * shape (T-02-12).
 */
export function buildContentFreePayload(lang: string, vid: string) {
  const strings = getStrings(lang as SupportedLanguage);
  return {
    title: strings.pushNotificationTitle,
    body: strings.pushNotificationBody,
    data: { vid },
  };
}

/**
 * Waits out the ACK grace period, re-checks `messages.delivered_at`
 * (PUSH-08 -- a foreground visitor's own SSE-receipt ack makes this send a
 * no-op), then sends to every subscription this visitor owns
 * independently: one subscription's failure never blocks another's send
 * attempt. 404/410 deletes the dead subscription (PUSH-10); any other
 * error only increments its failure count.
 *
 * `wait` defaults to a real `ACK_GRACE_PERIOD_MS` delay for every
 * production caller. It exists as an injectable seam only so tests can
 * skip the real 8s sleep without globally faking `setTimeout` -- a global
 * fake-timer approach (`node:test`'s `mock.timers`) was tried and rejected:
 * it also intercepts the DB driver's own internal `setTimeout` calls made
 * by the repo queries below, hanging every test past the tick.
 */
export async function sendPushToVisitor(
  conversationId: number,
  messageId: number,
  visitorId: string,
  lang: string,
  wait: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, ACK_GRACE_PERIOD_MS)),
): Promise<void> {
  await wait();

  const deliveredAt = await getDeliveredAt(messageId);
  if (deliveredAt) return;

  // Signed ONCE per call -- the same token is valid for every device this
  // visitor owns, so it is reused across the loop below, never re-signed
  // per subscription.
  const vid = await signVisitorId(visitorId, { lang });
  const payload = buildContentFreePayload(lang, vid);
  const payloadJson = JSON.stringify(payload);

  const subscriptions = await pushSubscriptions.listForVisitor(visitorId);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payloadJson,
        {
          TTL: 86400,
          urgency: "high",
          // Conversation-scoped -- coalesces multiple unread replies while
          // the phone is locked into one notification (D-13), distinct
          // from subscribe.ts's visitor-scoped probe topic.
          topic: `conv-${conversationId}`,
        },
      );
      await pushSubscriptions.markSuccess(sub.endpoint);
    } catch (error) {
      const statusCode = (error as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await pushSubscriptions.deleteByEndpoint(sub.endpoint);
      } else {
        await pushSubscriptions.markFailure(sub.endpoint);
      }
    }
  }
}
