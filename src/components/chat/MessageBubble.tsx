"use client";

// LANG-04/LANG-05/D-20: bidi-isolated message text (dir="auto" plus
// unicode-bidi: isolate on the text node itself, independent of the
// bubble's own ambient direction -- 01-RESEARCH.md's "Don't Hand-Roll" bidi
// row: never a hand-rolled regex reorder), exactly two delivery-state
// indicators for the visitor's own outgoing messages (Check for 'sent',
// RotateCcw for 'failed' -- never a delivered/seen state, never a third
// state), and timestamps always rendered through the shared ASCII-digit formatter
// (Plan 01-05's formatDigits). RotateCcw is the only icon in this file on
// the UI-SPEC.md mirroring allowlist -- Check never mirrors.
import { Check, RotateCcw } from "lucide-react";
import { formatDigits } from "@/lib/i18n/format";

export interface ChatMessageLike {
  id: number | string;
  sender: "visitor" | "owner";
  body: string;
  createdAt: string | number | Date;
}

export type DeliveryState = "sent" | "failed";

export interface MessageBubbleProps {
  message: ChatMessageLike;
  /** Only rendered for the visitor's own outgoing messages -- owner-sent bubbles never carry a delivery indicator. */
  deliveryState?: DeliveryState;
  /**
   * True while an optimistic send is in flight and durable persistence
   * (D-18) hasn't been confirmed yet -- forces 60% opacity and suppresses
   * the delivery icon until the outcome (sent/failed) is known.
   */
  pending?: boolean;
  /** Locked "Couldn't send. Tap to try again." copy -- sourced by the caller from locale JSON, never hardcoded here. */
  failedLabel?: string;
  onRetry?: () => void;
}

function formatTime(value: ChatMessageLike["createdAt"]): string {
  const date = value instanceof Date ? value : new Date(value);
  const hh = formatDigits(date.getHours());
  const mm = formatDigits(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function MessageBubble({ message, deliveryState, pending, failedLabel, onRetry }: MessageBubbleProps) {
  const isVisitorOwn = message.sender === "visitor";
  const showDeliveryIcon = isVisitorOwn && !pending;

  return (
    <div className={`flex ${isVisitorOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2 [overflow-wrap:anywhere] transition-opacity ${
          isVisitorOwn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        } ${pending ? "opacity-60" : "opacity-100"}`}
      >
        {/* dir="auto" + unicode-bidi: isolate on the text node itself -- a
            bare Latin URL or scripture reference embedded inside an Arabic
            message renders intact regardless of the bubble's own ambient
            direction (LANG-04). */}
        <p
          dir="auto"
          style={{ unicodeBidi: "isolate" }}
          className="text-[16px] leading-[1.5] font-normal whitespace-pre-wrap"
        >
          {message.body}
        </p>
        <div className="mt-1 flex items-center justify-end gap-1">
          <span
            dir="ltr"
            className="text-[14px] leading-[1.4] font-normal text-muted-foreground"
          >
            {formatTime(message.createdAt)}
          </span>
          {showDeliveryIcon && deliveryState === "sent" && (
            <Check aria-hidden="true" className="size-3.5 text-muted-foreground" />
          )}
          {showDeliveryIcon && deliveryState === "failed" && (
            <button
              type="button"
              onClick={onRetry}
              className="flex min-h-11 items-center gap-1 text-[14px] leading-[1.4] font-normal text-destructive"
            >
              <RotateCcw aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
              {failedLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
