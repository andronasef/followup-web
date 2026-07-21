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
import { Check, ChevronDown, RotateCcw } from "lucide-react";
import { useState } from "react";
import { formatDigits } from "@/lib/i18n/format";

export interface ChatMessageLike {
  id: number | string;
  sender: "visitor" | "owner";
  body: string;
  createdAt: string | number | Date;
  /**
   * Plan 02-05's OWNER_LANG-joined translation of this message, when one
   * exists. null/undefined when not yet translated, a same-language skip
   * (TRANS-06), or a failed translation -- in every one of those cases the
   * "See original" toggle never renders (D-12).
   */
  translation?: string | null;
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
  /** D-12: "See original"/"Hide original" toggle copy -- sourced by the caller (locale JSON on the visitor side, hardcoded English on the admin side). Defaults match both domains' identical English copy. */
  showOriginalLabel?: string;
  hideOriginalLabel?: string;
  /**
   * ADMIN-09 (Thread.tsx, Plan 02-08 Task 3): when true, the message's
   * `translation` field renders as the PRIMARY bubble text and the toggle
   * reveals the stored `body` instead -- the inverse of the default
   * visitor-side behavior (primary `body`, reveal `translation`, gated on
   * `sender === "owner"`). Applies uniformly to BOTH senders, since
   * `since()`/`sinceAll()`'s single OWNER_LANG join serves both
   * "translation of a visitor message" and "pre-edit original of an owner
   * message" semantics (Plan 02-05).
   */
  translationPrimary?: boolean;
}

function formatTime(value: ChatMessageLike["createdAt"]): string {
  const date = value instanceof Date ? value : new Date(value);
  // UTC, not local-time getters: this renders server-side (initial HTML,
  // in the container's timezone) and again client-side during hydration
  // (in the visitor's own browser timezone) -- local getHours()/getMinutes()
  // produced a different string in each place, a hydration text mismatch
  // (React error #418) that broke React's reconciliation for every message
  // after it, masquerading as "SSE messages never live-update".
  const hh = formatDigits(date.getUTCHours());
  const mm = formatDigits(date.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function MessageBubble({
  message,
  deliveryState,
  pending,
  failedLabel,
  onRetry,
  showOriginalLabel = "See original",
  hideOriginalLabel = "Hide original",
  translationPrimary = false,
}: MessageBubbleProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const isVisitorOwn = message.sender === "visitor";
  const showDeliveryIcon = isVisitorOwn && !pending;

  // TRANS-06: a translation identical to body (same-language pair, or a
  // degenerate short phrase that translates to itself) never renders a dead
  // toggle -- only a GENUINELY distinct translation does.
  const hasDistinctTranslation = Boolean(message.translation) && message.translation !== message.body;

  // D-12/ADMIN-09: two mirrored reveal directions sharing one component.
  // Visitor side (default): primary is the delivered `body`, gated to owner
  // messages only, revealing the owner's original-language `translation`.
  // Admin side (translationPrimary, Thread.tsx): primary is the OWNER_LANG
  // `translation`, applies to both senders uniformly, revealing the stored
  // `body`.
  const primaryText = translationPrimary && message.translation ? message.translation : message.body;
  const canToggle = translationPrimary
    ? hasDistinctTranslation
    : message.sender === "owner" && hasDistinctTranslation;
  const revealText = translationPrimary ? message.body : (message.translation ?? "");

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
          {primaryText}
        </p>
        {canToggle && (
          <>
            <button
              type="button"
              onClick={() => setShowOriginal((prev) => !prev)}
              aria-expanded={showOriginal}
              className="mt-1 flex min-h-11 items-center gap-1 text-[14px] leading-[1.4] font-normal text-muted-foreground"
            >
              <ChevronDown
                aria-hidden="true"
                className={`size-3.5 transition-transform ${showOriginal ? "rotate-180" : ""}`}
              />
              {showOriginal ? hideOriginalLabel : showOriginalLabel}
            </button>
            {showOriginal && (
              // Same bidi-isolation treatment as the primary text above --
              // never a divergent, hand-rolled rendering block.
              <p
                dir="auto"
                style={{ unicodeBidi: "isolate" }}
                className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-[16px] leading-[1.5] font-normal whitespace-pre-wrap text-foreground"
              >
                {revealText}
              </p>
            )}
          </>
        )}
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
