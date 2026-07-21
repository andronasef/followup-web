// PUSH-08: the visitor's client-side ACK -- the receiving half of
// send.ts's grace-period check (src/server/push/send.ts's
// sendPushToVisitor re-reads messages.delivered_at right after this
// write). Kept next/headers-free (same split rationale as
// chat/messages/send.ts's own header comment) so node:test can import it
// directly -- ack/route.ts is the only file that touches
// requireVisitor()/next-headers.
import { z } from "zod";
import { belongsToConversation, markDelivered } from "../../../../server/repo/messages.ts";

const bodySchema = z.object({
  messageId: z.number().int().positive(),
});

export interface HandleAckInput {
  conversationId: number;
  rawBody: unknown;
}

export type HandleAckResult = { status: 200 } | { status: 400; body: { error: string } };

/**
 * T-02-19: `messageId` is checked against the CALLER's own conversationId
 * before any write -- a visitor can never ack (and therefore never
 * suppress a push send for) another conversation's message. `markDelivered`
 * is itself `isNull`-guarded (see messages.ts), so a repeated ack for an
 * already-delivered message is a harmless idempotent no-op, always 200.
 */
export async function handleAck(input: HandleAckInput): Promise<HandleAckResult> {
  const parsed = bodySchema.safeParse(input.rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "invalid_body" } };
  }

  const belongs = await belongsToConversation(parsed.data.messageId, input.conversationId);
  if (!belongs) {
    return { status: 400, body: { error: "not_found" } };
  }

  await markDelivered(parsed.data.messageId);
  return { status: 200 };
}
