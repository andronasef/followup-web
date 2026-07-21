"use client";

// ADMIN-03: the owner's reply composer. Posts to /api/admin/messages (never
// /api/chat/messages -- that route is requireOwner()-guarded, not the
// visitor rate-limit path). A lighter version of Plan 01-10's
// Composer/composer-logic.ts silent-bounded-retry pattern -- this surface
// doesn't need D-19's full crisis-typing ceremony, but a transient failure
// must still never lose the owner's typed reply, so the text field is only
// ever cleared on confirmed success.
import { useState, type FormEvent } from "react";

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
}

export interface ReplyBoxProps {
  conversationId: number;
  onSent?: (message: ReplySentMessage) => void;
}

async function postReply(
  conversationId: number,
  body: string,
  clientMsgId: string,
): Promise<{ id: number; createdAt: string } | null> {
  try {
    const response = await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, body, clientMsgId }),
    });
    if (!response.ok) return null;
    return (await response.json()) as { id: number; createdAt: string };
  } catch {
    return null;
  }
}

export function ReplyBox({ conversationId, onSent }: ReplyBoxProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;

    setSending(true);
    setFailed(false);
    const clientMsgId = crypto.randomUUID();

    let result: { id: number; createdAt: string } | null = null;
    for (let attempt = 0; attempt <= REPLY_MAX_RETRIES; attempt++) {
      result = await postReply(conversationId, body, clientMsgId);
      if (result) break;
      if (attempt < REPLY_MAX_RETRIES) await delay(REPLY_RETRY_DELAY_MS);
    }

    setSending(false);

    if (!result) {
      // The text field is deliberately NOT cleared here -- a transient
      // failure must never lose the owner's typed reply.
      setFailed(true);
      return;
    }

    setText("");
    onSent?.({
      id: result.id,
      conversationId,
      sender: "owner",
      body,
      clientMsgId,
      createdAt: result.createdAt,
    });
  }

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
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write a reply"
          rows={1}
          className="max-h-[120px] min-h-11 flex-1 resize-none rounded-lg border border-input bg-background px-2.5 py-2 text-[16px] leading-[1.5] font-normal outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/50"
        />
        <button
          type="submit"
          disabled={sending || text.trim().length === 0}
          aria-label="Send reply"
          className="flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </form>
  );
}
