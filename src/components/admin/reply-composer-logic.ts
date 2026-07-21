// Pure, framework-free state-transition logic behind ReplyBox.tsx's D-09/D-10
// draft-preview-edit-send composer. Split out so it is directly
// node:test-able -- ReplyBox.tsx is a .tsx file with JSX, which plain
// `node --experimental-strip-types --test` cannot execute (type stripping is
// not a JSX transform). Same class of test-runnability split as
// src/components/chat/composer-logic.ts (JSX) and
// src/app/api/chat/messages/send.ts/reply.ts (next/headers) before it.

export type ComposerMode = "draft" | "preview";

export interface ComposerState {
  mode: ComposerMode;
  /** The owner's own-language typed text -- retained across a preview round-trip so "Edit original" can always restore it verbatim, never the edited preview (D-10). */
  draftText: string;
  /** The translated (and possibly owner-edited) text shown while `mode === "preview"`. */
  previewText: string;
  /** True after a translate-preview call fails/times out -- drives the "Couldn't translate. You can still send your original message." notice + "Send anyway" action. */
  previewFailed: boolean;
}

export function initialComposerState(): ComposerState {
  return { mode: "draft", draftText: "", previewText: "", previewFailed: false };
}

/** An empty/whitespace-only draft is a no-op -- returns null so the caller never calls Preview or Send. */
export function guardSubmit(rawText: string): string | null {
  const trimmed = rawText.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Editing the draft textarea in 'draft' mode. */
export function editDraft(state: ComposerState, value: string): ComposerState {
  return { ...state, draftText: value };
}

/** Editing the previewed text in 'preview' mode -- updates ONLY previewText, never touches the retained draftText. */
export function editPreview(state: ComposerState, value: string): ComposerState {
  return { ...state, previewText: value };
}

/** Preview succeeded: switch to 'preview' mode with the translated text, clearing any stale failure flag. draftText is retained unchanged. */
export function applyPreviewSuccess(state: ComposerState, translatedText: string): ComposerState {
  return { ...state, mode: "preview", previewText: translatedText, previewFailed: false };
}

/** Preview failed/timed out: stays in 'draft' mode, flags the failure so the caller shows the fallback notice + "Send anyway" action. */
export function applyPreviewFailure(state: ComposerState): ComposerState {
  return { ...state, mode: "draft", previewFailed: true };
}

/**
 * "Edit original": discards the current preview and returns to 'draft' mode
 * pre-loaded with the ORIGINAL draft text -- never the edited preview. Per
 * UI-SPEC's explicit rule, this never silently merges an edited translation
 * back onto the stored original.
 */
export function editOriginal(state: ComposerState): ComposerState {
  return { ...state, mode: "draft", previewText: "", previewFailed: false };
}

/** Confirmed send success: clears BOTH draftText and previewText and resets to 'draft' -- mirrors the composer's never-clear-on-failure discipline (only a confirmed 200 clears anything). */
export function applySendSuccess(): ComposerState {
  return initialComposerState();
}

export interface SendPayload {
  body: string;
  originalBody?: string;
}

/**
 * What to POST for the CURRENT state. 'draft' mode (no prior preview) sends
 * the typed text directly as `body` with no `originalBody` -- unchanged
 * Phase 1 behavior for a same-language or no-preview send. 'preview' mode
 * sends the current previewed/edited text as `body` plus the retained
 * original draft as `originalBody`.
 */
export function buildSendPayload(state: ComposerState): SendPayload {
  if (state.mode === "preview") {
    return { body: state.previewText, originalBody: state.draftText };
  }
  return { body: state.draftText };
}

/**
 * "Send anyway" after a translate-preview failure: sends the draft text
 * directly, bypassing preview entirely -- no `originalBody`, since there is
 * no distinct translation to preserve.
 */
export function buildSendAnywayPayload(state: ComposerState): SendPayload {
  return { body: state.draftText };
}
