// ADMIN-03: owner reply's actual behavior, kept in a module with no
// next/headers dependency (directly or transitively) so node:test can
// import it directly -- route.ts is the only file that touches
// requireOwner()/next-headers. See
// src/app/api/chat/messages/send.ts's header comment for the same
// rationale -- the exact same durability pattern as the visitor write path,
// not a separate, lesser code path.
import { z } from "zod";
import { sql as rawSql } from "drizzle-orm";
import { db } from "../../../../server/db/pool.ts";
import { OWNER_LANG } from "../../../../server/config/models.ts";
import { create as createMessage, type Message } from "../../../../server/repo/messages.ts";
import { upsert as upsertTranslation } from "../../../../server/repo/messageTranslations.ts";
import { getVisitorAndLangFor } from "../../../../server/repo/conversations.ts";

// Same bound as the visitor route -- Unicode-code-point-aware, not UTF-16
// code units.
export const MAX_MESSAGE_CODEPOINTS = 4000;

const bodySchema = z.object({
  conversationId: z.number().int().positive(),
  body: z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= MAX_MESSAGE_CODEPOINTS, {
      message: "message is too long",
    }),
  clientMsgId: z.string().min(1).optional(),
  // TRANS-02/03/04: the owner's pre-edit preview draft (OWNER_LANG),
  // present only when the preview-then-edit flow was actually used. D-11:
  // `body` (whatever is currently in the composer, translated or not) is
  // already the untranslated-original fallback when translation
  // fails/times out -- this field exists to capture the ORIGINAL when a
  // preview succeeded, not as a fallback mechanism itself.
  originalBody: z.string().trim().optional(),
});

export interface AdminReplyInput {
  ownerId: string | null;
  rawBody: unknown;
}

export type AdminReplyResult =
  // conversationId/visitorId/visitorLang are additive -- Plan 02-06's
  // route.ts wrapper reads them to kick off its own post-persist push-send
  // trigger without a second conversation/visitor lookup of its own.
  // Existing callers only destructure {id, createdAt}, so this is a
  // harmless superset of the existing JSON shape.
  | {
      status: 200;
      body: {
        id: number;
        createdAt: Message["createdAt"];
        conversationId: number;
        visitorId: string;
        visitorLang: string;
      };
    }
  | { status: 400; body: { error: string } }
  | { status: 401; body: { error: string } };

/**
 * `ownerId` is the caller's already-verified responder id (or null for "no
 * valid owner session") -- the guard check happens before any body parsing
 * or DB access, so an unauthenticated caller can never reach the write.
 */
export async function handleAdminReply(input: AdminReplyInput): Promise<AdminReplyResult> {
  if (!input.ownerId) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  const parsed = bodySchema.safeParse(input.rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "invalid_body" } };
  }

  // PUSH-06/08: resolve the recipient visitor id + lang up front -- the
  // exact lookup route.ts's push trigger needs, echoed back below rather
  // than making route.ts issue a second query. A conversationId that
  // doesn't exist is rejected here (400) instead of surfacing as an
  // unhandled foreign-key error from the insert below.
  const visitorAndLang = await getVisitorAndLangFor(parsed.data.conversationId);
  if (!visitorAndLang) {
    return { status: 400, body: { error: "conversation_not_found" } };
  }

  const created = await db.transaction(async (tx) => {
    const row = await createMessage(
      parsed.data.conversationId,
      "owner",
      parsed.data.body,
      parsed.data.clientMsgId ?? null,
      tx,
    );

    // TRANS-02/03/04: persist the owner's pre-edit original in the SAME
    // transaction as the message insert -- no second round trip, no risk
    // of an orphaned translation row if the transaction rolls back. Only
    // when the preview-then-edit flow was actually used AND the owner's
    // final send differs from the previewed original (an unedited preview
    // send that matches body exactly needs no separate "original" row --
    // the visitor's own message list can already reconstruct it).
    if (parsed.data.originalBody && parsed.data.originalBody !== parsed.data.body) {
      await upsertTranslation(row.id, OWNER_LANG, parsed.data.originalBody, "ready", tx);
    }

    // T-01-24: pointers only, never the message body -- same transaction as
    // the insert above.
    await tx.execute(
      rawSql`select pg_notify('chat', ${JSON.stringify({ c: parsed.data.conversationId, m: row.id, k: "message" })})`,
    );
    return row;
  });

  return {
    status: 200,
    body: {
      id: created.id,
      createdAt: created.createdAt,
      conversationId: parsed.data.conversationId,
      visitorId: visitorAndLang.visitorId,
      visitorLang: visitorAndLang.lang ?? "en",
    },
  };
}
