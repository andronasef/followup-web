"use client";

// Scroll-anchor-on-bottom: the thread anchors to the newest message on
// mount and on a new message ONLY when the reader was already scrolled to
// the bottom before it arrived -- never yanking someone scrolled up
// reading history. `isAtBottomRef` is updated by an actual scroll listener
// (the reader's own last-known position), not recomputed after a new
// message has already grown the container -- recomputing after growth
// would always read "not at bottom" the instant a message arrives, which
// is exactly the bug this ref avoids.
import { useEffect, useLayoutEffect, useRef } from "react";
import { MessageBubble, type ChatMessageLike, type DeliveryState } from "./MessageBubble";

export interface MessageListItem extends ChatMessageLike {
  deliveryState?: DeliveryState;
  pending?: boolean;
}

export interface MessageListProps {
  messages: MessageListItem[];
  /** Locked failed-state copy, forwarded to each MessageBubble -- sourced from locale JSON by the caller. */
  failedLabel?: string;
  onRetry?: (id: MessageListItem["id"]) => void;
  /** D-12: locale-JSON "See original"/"Hide original" copy, forwarded to each MessageBubble's tap-to-reveal toggle. */
  showOriginalLabel?: string;
  hideOriginalLabel?: string;
}

const AT_BOTTOM_THRESHOLD_PX = 32;

export function MessageList({
  messages,
  failedLabel,
  onRetry,
  showOriginalLabel,
  hideOriginalLabel,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const hasMountedRef = useRef(false);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_THRESHOLD_PX;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (!hasMountedRef.current) {
      // Anchor to the newest message on open, regardless of prior state.
      el.scrollTop = el.scrollHeight;
      isAtBottomRef.current = true;
      hasMountedRef.current = true;
      prevCountRef.current = messages.length;
      return;
    }

    const gotNewMessage = messages.length > prevCountRef.current;
    prevCountRef.current = messages.length;

    if (gotNewMessage && isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div ref={containerRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-2">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          deliveryState={message.deliveryState}
          pending={message.pending}
          failedLabel={failedLabel}
          onRetry={onRetry ? () => onRetry(message.id) : undefined}
          showOriginalLabel={showOriginalLabel}
          hideOriginalLabel={hideOriginalLabel}
        />
      ))}
    </div>
  );
}
