// TRANS-02/TRANS-03: the owner's bounded, synchronous draft-preview call --
// Plan 02-08's composer calls this before Send so the (possibly owner-
// edited) previewed text can be swapped inline into the composer's own
// textbox (D-09's inline-swap UX, not a side-by-side comparison view).
//
// Deliberately calls translate.translate() directly instead of
// translation/cache.ts's translateAndCache() -- a preview has no messageId
// yet to key a cache row on, and nothing here is ever persisted (reply.ts's
// Task 3 persists the ALREADY-computed, possibly-edited original text on
// Send, not a fresh translate() call). Bounded entirely by translate.ts's
// own openaiClient timeout/maxRetries config (Plan 02-02) -- no second
// manual timeout layer is added here.
//
// T-02-15: on failure/timeout this returns a generic {translatedText: null,
// failed: true} shape -- never a 500, never a raw provider error string
// that could itself contain or hint at the untranslated draft.
import { z } from "zod";
import { OWNER_LANG } from "../../../../server/config/models.ts";
import { getVisitorLangFor } from "../../../../server/repo/conversations.ts";
import {
  hasRefusalMarker,
  lengthRatioOk,
  preservesTokens,
  scriptBlockMatch,
  translate,
} from "../../../../server/translation/translate.ts";

const bodySchema = z.object({
  conversationId: z.number().int().positive(),
  draftText: z.string().trim().min(1),
});

export interface TranslatePreviewInput {
  ownerId: string | null;
  rawBody: unknown;
}

export type TranslatePreviewResult =
  | { status: 200; body: { translatedText: string } }
  | { status: 200; body: { translatedText: null; failed: true } }
  | { status: 400; body: { error: string } }
  | { status: 401; body: { error: string } };

/**
 * `ownerId` is the caller's already-verified responder id (or null for "no
 * valid owner session") -- the guard check happens before any body parsing
 * or DB/LLM access, matching reply.ts's own discipline.
 */
export async function translatePreview(input: TranslatePreviewInput): Promise<TranslatePreviewResult> {
  if (!input.ownerId) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  const parsed = bodySchema.safeParse(input.rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "invalid_body" } };
  }

  // getVisitorLangFor's own doc comment defers the null->"en" fallback
  // decision to its caller -- this endpoint is that caller.
  const visitorLang = (await getVisitorLangFor(parsed.data.conversationId)) ?? "en";

  if (visitorLang === OWNER_LANG) {
    // Same-language skip -- no LLM call; the draft is already in the
    // visitor's language, returned unchanged.
    return { status: 200, body: { translatedText: parsed.data.draftText } };
  }

  const result = await translate(parsed.data.draftText, OWNER_LANG, visitorLang);
  if (!result.ok) {
    return { status: 200, body: { translatedText: null, failed: true } };
  }

  const valid =
    scriptBlockMatch(result.text, visitorLang) &&
    lengthRatioOk(parsed.data.draftText, result.text) &&
    !hasRefusalMarker(result.text) &&
    preservesTokens(parsed.data.draftText, result.text);

  if (!valid) {
    return { status: 200, body: { translatedText: null, failed: true } };
  }

  return { status: 200, body: { translatedText: result.text } };
}
