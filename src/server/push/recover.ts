// ID-03: the general lost-both-cookie-and-localStorage visitor recovery
// path -- distinct from ID-04's iOS-specific vid-token path
// (vid-token/route.ts + pre-paint.ts's URL carry). next/headers-free (same
// split rationale as ack.ts/send.ts) so node:test can import it directly
// -- recover/route.ts is the only file that touches cookies()/next-headers.
//
// Per visitor.ts's assumption_delta_decision: this only ever corrects an
// ALREADY-established identity forward (a push_subscriptions row keyed by
// an endpoint the server itself issued that subscription against), never
// inventing a new one from an unknown endpoint (T-02-18).
import { z } from "zod";
import { getByEndpoint } from "../repo/pushSubscriptions.ts";
import { getOrCreate as getOrCreateVisitor } from "../repo/visitors.ts";
import { signVisitorId } from "../auth/session.ts";

const bodySchema = z.object({ endpoint: z.string().url() });

export type RecoverResult =
  // `cookieValue` is the already-signed JWT the caller (route.ts) sets as
  // the visitor cookie -- kept out of `body` so this module never has to
  // touch cookies()/next-headers itself.
  | { status: 200; body: { lang: string; appearance: string }; cookieValue: string }
  | { status: 400; body: { error: string } }
  | { status: 404; body: { error: string } };

export async function handleRecover(rawBody: unknown): Promise<RecoverResult> {
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "invalid_body" } };
  }

  const subscription = await getByEndpoint(parsed.data.endpoint);
  if (!subscription) {
    return { status: 404, body: { error: "not_found" } };
  }

  // subscription.visitorId is FK-guaranteed to reference an existing
  // visitors row -- getOrCreate always finds (never mints) it here, also
  // touching last_seen_at as a natural side effect of recovery.
  const visitor = await getOrCreateVisitor(subscription.visitorId);
  const lang = visitor.lang ?? "en";
  const appearance = visitor.appearance ?? "system";
  const cookieValue = await signVisitorId(visitor.id, { lang, appearance });

  return { status: 200, body: { lang, appearance }, cookieValue };
}
