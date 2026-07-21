// PUSH-12: the round-trip probe. This is the FIRST call site of
// signVisitorId's data.vid mechanism (RESEARCH.md Architecture Pattern 5) --
// Plan 02-06's vid-token/route.ts calls the same primitive later, on-demand,
// for the URL-carried identity handoff (ID-04), not deferred from here.
//
// Deliberately kept `next/headers`-free (mirrors send.ts/reply.ts's split,
// 01-08's established pattern) so node:test can import this module's
// behavior directly -- src/app/api/push/subscribe/route.ts is the only file
// that touches requireVisitor()/next-headers.
//
// T-02-12 (kept per threat_model): the payload is built exclusively from
// fixed locale strings (getStrings) + a signed routing token -- the text a
// visitor or the owner actually typed is never read or referenced anywhere
// in this file.
import { z } from "zod";
import { webpush } from "./vapid.ts";
import { signVisitorId } from "../auth/session.ts";
import * as pushSubscriptions from "../repo/pushSubscriptions.ts";
import * as gateFunnel from "../repo/gateFunnel.ts";
import { getStrings } from "../../lib/i18n/strings.ts";
import type { SupportedLanguage } from "../i18n/detect.ts";

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().min(1),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  platform: z.enum(["ios", "other"]),
});

export interface HandleSubscribeInput {
  visitorId: string;
  lang: string;
  rawBody: unknown;
}

export type HandleSubscribeResult =
  | { status: 200; body: { probeOk: boolean } }
  | { status: 400; body: { error: string } }
  | { status: 401; body: { error: string } };

/**
 * Upserts the subscription, fires the PUSH-12 synchronous probe send, and
 * unconditionally records the funnel `granted_at` stage (RESEARCH.md
 * Architecture Pattern 5 -- grant is a browser-level fact independent of
 * whether the probe send itself succeeds).
 */
export async function handleSubscribe(input: HandleSubscribeInput): Promise<HandleSubscribeResult> {
  const parsed = subscribeSchema.safeParse(input.rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "invalid_body" } };
  }

  const { subscription, platform } = parsed.data;

  await pushSubscriptions.create(
    input.visitorId,
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth,
  );

  // FIRST call site of signVisitorId's data.vid mechanism -- a real signed
  // JWT, never null, decodable back to this same visitorId via
  // verifySession (T-02-14).
  const vid = await signVisitorId(input.visitorId, { lang: input.lang });
  const strings = getStrings(input.lang as SupportedLanguage);
  const payload = {
    title: strings.pushNotificationTitle,
    body: strings.pushNotificationBody,
    data: { vid },
  };

  let probeOk: boolean;
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 86400,
      urgency: "high",
      // Visitor-scoped, not conversation-scoped -- no conversationId is
      // known or needed at subscribe-time (send.ts's Task 2 uses a
      // separate, conv-scoped topic for live replies).
      topic: `probe-${input.visitorId}`,
    });
    probeOk = true;
    await pushSubscriptions.markSuccess(subscription.endpoint);
  } catch (error) {
    // ANY error, not just 404/410 -- this is a first-time probe, not
    // PUSH-10's later "confirmed gone" cleanup pass, so the row is never
    // deleted here. Logged server-side only, never surfaced to the visitor
    // (PUSH-12's "grant is recorded regardless of probe outcome" truth).
    probeOk = false;
    console.error("[push] probe send failed", error);
  }

  // Unconditional: success or probe-failure, exactly once per call
  // (idempotent per gateFunnel's own COALESCE-based upsert design).
  await gateFunnel.recordGranted(input.visitorId, platform);

  return { status: 200, body: { probeOk } };
}
