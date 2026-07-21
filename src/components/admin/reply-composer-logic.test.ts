// RED: behavior tests for ReplyBox.tsx's D-09/D-10 draft-preview-edit-send
// state machine. ReplyBox.tsx itself is a .tsx file with JSX -- see
// reply-composer-logic.ts's header comment for why the logic is extracted
// here to be directly node:test-able.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyPreviewFailure,
  applyPreviewSuccess,
  applySendSuccess,
  buildSendAnywayPayload,
  buildSendPayload,
  editDraft,
  editOriginal,
  editPreview,
  guardSubmit,
  initialComposerState,
} from "./reply-composer-logic.ts";

test("initialComposerState: starts in 'draft' mode with everything empty", () => {
  const state = initialComposerState();
  assert.equal(state.mode, "draft");
  assert.equal(state.draftText, "");
  assert.equal(state.previewText, "");
  assert.equal(state.previewFailed, false);
});

test("guardSubmit: an empty or whitespace-only value is a no-op -- returns null", () => {
  assert.equal(guardSubmit(""), null);
  assert.equal(guardSubmit("   \n\t  "), null);
});

test("guardSubmit: a non-empty value returns the trimmed text", () => {
  assert.equal(guardSubmit("  hello there  "), "hello there");
});

test("draft mode with no prior preview sends the typed text directly as body, no originalBody (unchanged Phase 1 behavior)", () => {
  let state = initialComposerState();
  state = editDraft(state, "hello");
  const payload = buildSendPayload(state);
  assert.equal(payload.body, "hello");
  assert.equal(payload.originalBody, undefined);
});

test("applyPreviewSuccess: switches to 'preview' mode showing the translated (editable) text, retaining the original draft", () => {
  let state = initialComposerState();
  state = editDraft(state, "hello");
  state = applyPreviewSuccess(state, "hola");
  assert.equal(state.mode, "preview");
  assert.equal(state.previewText, "hola");
  assert.equal(state.draftText, "hello", "the original draft must be retained, unchanged");
  assert.equal(state.previewFailed, false);
});

test("editPreview: editing the previewed text in 'preview' mode updates ONLY the previewed text, never the retained original draft", () => {
  let state = initialComposerState();
  state = editDraft(state, "hello");
  state = applyPreviewSuccess(state, "hola");
  state = editPreview(state, "hola amigo");
  assert.equal(state.previewText, "hola amigo");
  assert.equal(state.draftText, "hello", "the original draft must never be touched by editing the preview");
});

test("editOriginal: discards the preview and returns to 'draft' mode pre-loaded with the ORIGINAL draft text, not the edited preview", () => {
  let state = initialComposerState();
  state = editDraft(state, "hello");
  state = applyPreviewSuccess(state, "hola");
  state = editPreview(state, "hola amigo -- edited");
  state = editOriginal(state);
  assert.equal(state.mode, "draft");
  assert.equal(state.draftText, "hello", "must restore the ORIGINAL draft, never the edited preview");
  assert.equal(state.previewText, "", "preview state must be discarded, not carried forward");
});

test("sending from 'preview' mode posts the current previewed/edited text as body plus the retained original draft as originalBody", () => {
  let state = initialComposerState();
  state = editDraft(state, "hello");
  state = applyPreviewSuccess(state, "hola");
  state = editPreview(state, "hola amigo");
  const payload = buildSendPayload(state);
  assert.equal(payload.body, "hola amigo", "must send the CURRENT previewed/edited text");
  assert.equal(payload.originalBody, "hello", "must send the retained ORIGINAL draft as originalBody");
});

test("applyPreviewFailure: flags previewFailed and stays in 'draft' mode -- a translation failure never blocks the draft from being sent directly", () => {
  let state = initialComposerState();
  state = editDraft(state, "hello");
  state = applyPreviewFailure(state);
  assert.equal(state.mode, "draft");
  assert.equal(state.previewFailed, true);
});

test("buildSendAnywayPayload: sends the draft text directly, bypassing preview, with no originalBody (no distinct translation to preserve)", () => {
  let state = initialComposerState();
  state = editDraft(state, "hello");
  state = applyPreviewFailure(state);
  const payload = buildSendAnywayPayload(state);
  assert.equal(payload.body, "hello");
  assert.equal(payload.originalBody, undefined);
});

test("applySendSuccess: confirmed success clears BOTH draftText and previewText and resets mode to 'draft'", () => {
  let state = initialComposerState();
  state = editDraft(state, "hello");
  state = applyPreviewSuccess(state, "hola");
  state = applySendSuccess();
  assert.equal(state.mode, "draft");
  assert.equal(state.draftText, "");
  assert.equal(state.previewText, "");
  assert.equal(state.previewFailed, false);
});
