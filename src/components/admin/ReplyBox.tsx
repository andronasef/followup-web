"use client";

// ADMIN-03/TRANS-02/TRANS-03: the owner's reply composer. Posts to
// /api/admin/messages (never /api/chat/messages -- that route is
// requireOwner()-guarded, not the visitor rate-limit path). Extended in
// Plan 02-08 with D-09's inline-swap draft-preview-edit-send flow -- the
// SAME textbox carries the draft, then the translated (editable) text,
// never a side-by-side comparison view. The pure state-transition logic
// lives in reply-composer-logic.ts (directly node:test-able); this file
// wires it to React state/DOM/fetch, matching Plan 01-10's Composer.tsx /
// composer-logic.ts split.
import { useState, type FormEvent } from "react";
import { SendHorizontal, Undo2 } from "lucide-react";
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
  type ComposerState,
} from "./reply-composer-logic";

const REPLY_MAX_RETRIES = 3;
const REPLY_RETRY_DELAY_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ReplySentMessage {
  id: number;
  conversationId: number;
  sender: "owner";
  body: string;
  clientMsgId: string;
  createdAt: string;
  /** The retained pre-edit original draft, when a distinct one was sent -- lets Thread.tsx render this just-sent message with the same translated-primary/see-original treatment as every other row, without waiting on a stream round trip. */
  translation: string | null;
}

export interface ReplyBoxProps {
  conversationId: number;
  onSent?: (message: ReplySentMessage) => void;
}

async function postReply(
  conversationId: number,
  body: string,
  clientMsgId: string,
  originalBody?: string,
): Promise<{ id: number; createdAt: string } | null> {
  try {
    const response = await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, body, clientMsgId, originalBody }),
    });
    if (!response.ok) return null;
    return (await response.json()) as { id: number; createdAt: string };
  } catch {
    return null;
  }
}

async function postTranslatePreview(
  conversationId: number,
  draftText: string,
): Promise<{ translatedText: string } | null> {
  try {
    const response = await fetch("/api/admin/messages/translate-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, draftText }),
    });
    if (!response.ok) return null;
    const result = (await response.json()) as { translatedText: string | null; failed?: true };
    if (result.failed || result.translatedText === null) return null;
    return { translatedText: result.translatedText };
  } catch {
    return null;
  }
}

export function ReplyBox({ conversationId, onSent }: ReplyBoxProps) {
  const [state, setState] = useState<ComposerState>(initialComposerState());
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const currentText = state.mode === "preview" ? state.previewText : state.draftText;

  function handleTextChange(value: string) {
    setState((prev) => (prev.mode === "preview" ? editPreview(prev, value) : editDraft(prev, value)));
  }

  async function handlePreview() {
    const body = guardSubmit(state.draftText);
    if (!body || previewing) return;

    setPreviewing(true);
    const result = await postTranslatePreview(conversationId, body);
    setPreviewing(false);

    setState((prev) => (result ? applyPreviewSuccess(prev, result.translatedText) : applyPreviewFailure(prev)));
  }

  function handleEditOriginal() {
    setState((prev) => editOriginal(prev));
  }

  // `payload.originalBody` is only ever set when `buildSendPayload` was
  // called against `mode === "preview"` state (see
  // reply-composer-logic.ts's own doc comment + tests) -- draft-mode sends
  // and "Send anyway" (buildSendAnywayPayload) never populate it, so
  // `originalBody` reaches the wire exclusively on the preview-mode send
  // path, never a same-language/no-preview send.
  async function doSend(payload: { body: string; originalBody?: string }) {
    if (sending) return;
    setSending(true);
    setFailed(false);
    const clientMsgId = crypto.randomUUID();

    let result: { id: number; createdAt: string } | null = null;
    for (let attempt = 0; attempt <= REPLY_MAX_RETRIES; attempt++) {
      result = await postReply(conversationId, payload.body, clientMsgId, payload.originalBody);
      if (result) break;
      if (attempt < REPLY_MAX_RETRIES) await delay(REPLY_RETRY_DELAY_MS);
    }

    setSending(false);

    if (!result) {
      // The composer state is deliberately NOT cleared here -- a transient
      // failure must never lose the owner's typed reply or preview.
      setFailed(true);
      return;
    }

    onSent?.({
      id: result.id,
      conversationId,
      sender: "owner",
      body: payload.body,
      clientMsgId,
      createdAt: result.createdAt,
      translation: payload.originalBody && payload.originalBody !== payload.body ? payload.originalBody : null,
    });
    setState(applySendSuccess());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const body = guardSubmit(currentText);
    if (!body) return;
    await doSend(buildSendPayload(state));
  }

  async function handleSendAnyway() {
    const body = guardSubmit(state.draftText);
    if (!body) return;
    await doSend(buildSendAnywayPayload(state));
  }

  const canSubmit = guardSubmit(currentText) !== null && !sending;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 border-t border-border bg-muted p-4 pb-[env(safe-area-inset-bottom)]"
    >
      {failed ? (
        <p className="text-[14px] leading-[1.4] font-normal text-destructive">
          Couldn&apos;t send. Try again.
        </p>
      ) : null}
      {state.previewFailed ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[14px] leading-[1.4] font-normal text-destructive">
            Couldn&apos;t translate. You can still send your original message.
          </p>
          <button
            type="button"
            onClick={handleSendAnyway}
            disabled={sending}
            className="flex min-h-11 shrink-0 items-center justify-center rounded-lg px-3 text-[14px] leading-[1.4] font-normal text-foreground outline-none focus-visible:ring-3 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50"
          >
            Send anyway
          </button>
        </div>
      ) : null}
      {state.mode === "preview" ? (
        <button
          type="button"
          onClick={handleEditOriginal}
          aria-label="Edit your original message"
          className="flex min-h-11 w-fit items-center gap-1 text-[14px] leading-[1.4] font-normal text-muted-foreground"
        >
          <Undo2 aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
          Edit original
        </button>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          value={currentText}
          onChange={(event) => handleTextChange(event.target.value)}
          placeholder="Write a reply"
          rows={1}
          className="max-h-[120px] min-h-11 flex-1 resize-none rounded-lg border border-input bg-background px-2.5 py-2 text-[16px] leading-[1.5] font-normal outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/50"
        />
        {state.mode === "draft" && (
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewing || guardSubmit(state.draftText) === null}
            aria-label="Preview translation"
            className="flex min-h-11 shrink-0 items-center justify-center rounded-lg px-3 text-[14px] leading-[1.4] font-normal text-foreground outline-none focus-visible:ring-3 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50"
          >
            {previewing ? "Translating…" : "Preview"}
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label="Send"
          className="flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50"
        >
          <SendHorizontal aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        </button>
      </div>
    </form>
  );
}
