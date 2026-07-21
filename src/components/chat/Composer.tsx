"use client";

// CHAT-03/D-18/D-19/D-20: optimistic send, silent bounded auto-retry, and
// exactly one failed bubble with tap-to-retry. The state machine itself
// lives in composer-logic.ts (framework-free, node:test-able); this file
// wires that logic to the textarea, the send button, and
// POST /api/chat/messages. All copy is sourced from locale JSON (getStrings)
// -- nothing here is a hardcoded string per UI-SPEC.md's Copywriting
// Contract rule.
import { useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { getStrings } from "@/lib/i18n/strings";
import type { SupportedLanguage } from "@/server/i18n/detect";
import { MessageBubble } from "./MessageBubble";
import { createOptimisticBubble, guardSubmit, sendWithRetry, type OptimisticBubble } from "./composer-logic";

export interface ComposerProps {
  lang: SupportedLanguage;
  /** Fires once a bubble durably settles to 'sent', carrying the server-confirmed id/createdAt -- lets a caller merge it into the real transcript. Optional so this component is fully self-contained without it (Plan 01-12 wires this up). */
  onSent?: (result: { clientMsgId: string; id: number; createdAt: string }) => void;
  /**
   * clientMsgIds already visible in the durable, SSE-confirmed transcript a
   * parent renders elsewhere (e.g. MessageList). Once a locally-optimistic
   * bubble's clientMsgId appears here, it's hidden from this component's own
   * render -- the same message would otherwise appear twice: once as
   * Composer's own bubble, once as the durable row the visitor's own SSE
   * connection echoes back (Plan 01-12's page composition). Optional/absent
   * by default so Composer keeps rendering every bubble it owns when used
   * standalone, without a parent merging into a shared transcript.
   */
  confirmedClientMsgIds?: ReadonlySet<string>;
}

// Body role: 16px/1.5 -- one line is 24px. Capped at 5 lines (UI-SPEC.md
// overflow/composer-growth row) before the textarea scrolls internally.
const LINE_HEIGHT_PX = 24;
const MAX_LINES = 5;
const MAX_TEXTAREA_HEIGHT_PX = LINE_HEIGHT_PX * MAX_LINES;

export function Composer({ lang, onSent, confirmedClientMsgIds }: ComposerProps) {
  const strings = getStrings(lang);
  const [text, setText] = useState("");
  const [bubbles, setBubbles] = useState<OptimisticBubble[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT_PX ? "auto" : "hidden";
  }

  function updateBubble(clientMsgId: string, patch: Partial<OptimisticBubble>) {
    setBubbles((prev) => prev.map((bubble) => (bubble.clientMsgId === clientMsgId ? { ...bubble, ...patch } : bubble)));
  }

  async function postOnce(body: string, clientMsgId: string): Promise<boolean> {
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, clientMsgId }),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as { id: number; createdAt: string };
      onSent?.({ clientMsgId, id: data.id, createdAt: data.createdAt });
      return true;
    } catch {
      return false;
    }
  }

  // D-19: silent, bounded retry (composer-logic.ts) before any UI change --
  // only the final outcome flips this one bubble to 'sent' or 'failed'.
  async function attemptSend(bubble: OptimisticBubble) {
    const ok = await sendWithRetry(() => postOnce(bubble.body, bubble.clientMsgId));
    updateBubble(bubble.clientMsgId, { state: ok ? "sent" : "failed" });
  }

  function handleSubmit() {
    const body = guardSubmit(text);
    if (!body) return; // CHAT-03: empty/whitespace-only is a no-op -- no API call, no bubble.

    const clientMsgId = crypto.randomUUID();
    const bubble = createOptimisticBubble(body, clientMsgId);
    setBubbles((prev) => [...prev, bubble]);

    // Optimistic: the composer clears for the next message the instant the
    // bubble is created -- the typed text lives on in the bubble itself
    // (and stays there through any retry/failure per D-19), not the input.
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    void attemptSend(bubble);
  }

  function handleRetry(bubble: OptimisticBubble) {
    // Same clientMsgId -- an idempotent retry server-side (Plan 01-08).
    updateBubble(bubble.clientMsgId, { state: "sending" });
    void attemptSend(bubble);
  }

  const canSend = guardSubmit(text) !== null;

  // Hide any bubble whose clientMsgId a parent has confirmed already
  // appears in the durable, SSE-backed transcript (Plan 01-12) -- prevents
  // a just-sent message from rendering twice.
  const visibleBubbles = confirmedClientMsgIds
    ? bubbles.filter((bubble) => !confirmedClientMsgIds.has(bubble.clientMsgId))
    : bubbles;

  return (
    <div className="border-t border-border bg-muted pb-[env(safe-area-inset-bottom)]">
      {visibleBubbles.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pt-2">
          {visibleBubbles.map((bubble) => (
            <MessageBubble
              key={bubble.clientMsgId}
              message={{
                id: bubble.clientMsgId,
                sender: "visitor",
                body: bubble.body,
                createdAt: new Date(),
              }}
              pending={bubble.state === "sending"}
              deliveryState={bubble.state === "sending" ? undefined : bubble.state}
              failedLabel={strings.errorSendFailed}
              onRetry={() => handleRetry(bubble)}
            />
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 p-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            autoGrow();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={strings.composerPlaceholder}
          rows={1}
          className="max-h-[120px] min-h-11 flex-1 resize-none rounded-lg border border-input bg-background px-2.5 py-2 text-[16px] leading-[1.5] font-normal outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/50"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          aria-label={strings.sendAriaLabel}
          className={`flex size-11 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-100 ${
            canSend ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <SendHorizontal aria-hidden="true" className="rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
