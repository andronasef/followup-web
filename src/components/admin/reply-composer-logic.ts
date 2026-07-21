// RED stub -- see reply-composer-logic.test.ts for the behavior this module
// must satisfy. Intentionally unimplemented so the test suite fails first.
export type ComposerMode = "draft" | "preview";

export interface ComposerState {
  mode: ComposerMode;
  draftText: string;
  previewText: string;
  previewFailed: boolean;
}

export interface SendPayload {
  body: string;
  originalBody?: string;
}

export function initialComposerState(): ComposerState {
  throw new Error("not implemented");
}

export function guardSubmit(_rawText: string): string | null {
  throw new Error("not implemented");
}

export function editDraft(_state: ComposerState, _value: string): ComposerState {
  throw new Error("not implemented");
}

export function editPreview(_state: ComposerState, _value: string): ComposerState {
  throw new Error("not implemented");
}

export function applyPreviewSuccess(_state: ComposerState, _translatedText: string): ComposerState {
  throw new Error("not implemented");
}

export function applyPreviewFailure(_state: ComposerState): ComposerState {
  throw new Error("not implemented");
}

export function editOriginal(_state: ComposerState): ComposerState {
  throw new Error("not implemented");
}

export function applySendSuccess(): ComposerState {
  throw new Error("not implemented");
}

export function buildSendPayload(_state: ComposerState): SendPayload {
  throw new Error("not implemented");
}

export function buildSendAnywayPayload(_state: ComposerState): SendPayload {
  throw new Error("not implemented");
}
