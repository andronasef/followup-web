"use client";

// CHAT-04/CHAT-07/D-15/D-16/D-17: a client hook wrapping the browser's
// built-in EventSource against /api/chat/stream. Last-Event-ID replay is
// entirely native EventSource behavior -- the browser automatically resends
// the last-received event's `id:` line as a Last-Event-ID header on every
// reconnect, so this file deliberately does NOT hand-roll a query-param or
// header cursor of its own (RESEARCH.md's "Don't Hand-Roll" guidance).
//
// This hook owns exactly one EventSource instance and listens for its own
// "message" events (dedup + append). It does NOT import usePresence.ts --
// the "presence" event is instead reachable by a caller (Plan 01-12's page
// wiring) through the raw `eventSource` this hook returns, so neither this
// file nor usePresence.ts needs to import the other (the action text's
// explicit decoupling requirement).
import { useEffect, useRef, useState } from "react";

/** D-16: the polling fallback (`GET /api/messages?since=`) is fully built (Plan 01-08) but the client switch stays off this phase -- flipping this later is meant to be a one-line change, not a new code path. */
export const POLLING_FALLBACK_ENABLED = false;

// D-17: the ~4-minute D-15 recycle produces exactly one native `error`
// event before EventSource's automatic reconnect succeeds -- that single
// error must never surface as "Reconnecting...". Requiring MORE than one
// consecutive error (reset to 0 on every successful open/message) means a
// lone recycle-driven error never crosses this threshold, while a
// genuinely stuck connection (repeated consecutive errors, no successful
// reopen in between) does.
const RECONNECT_ERROR_THRESHOLD = 3;

export interface ChatStreamMessage {
  id: number;
  conversationId: number;
  sender: "visitor" | "owner";
  body: string;
  clientMsgId: string | null;
  createdAt: string;
}

export interface UseChatStreamResult {
  messages: ChatStreamMessage[];
  /** D-17: only true after repeated CONSECUTIVE connection failures -- never during the routine D-15 recycle. Drives the quiet "Reconnecting…" Label line, nothing more. */
  isReconnecting: boolean;
  /** The raw EventSource instance, so a caller (e.g. Plan 01-12's page wiring) can attach its own "presence" listener on the exact same connection without this hook importing usePresence.ts. */
  eventSource: EventSource | null;
}

export function useChatStream(url = "/api/chat/stream"): UseChatStreamResult {
  const [messages, setMessages] = useState<ChatStreamMessage[]>([]);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const consecutiveErrorsRef = useRef(0);

  useEffect(() => {
    const es = new EventSource(url);
    setEventSource(es);

    const handleConnected = () => {
      consecutiveErrorsRef.current = 0;
      setIsReconnecting(false);
    };

    es.addEventListener("open", handleConnected);

    es.addEventListener("message", (event: MessageEvent<string>) => {
      handleConnected();
      let row: ChatStreamMessage;
      try {
        row = JSON.parse(event.data) as ChatStreamMessage;
      } catch {
        return; // malformed payload -- ignore rather than crash the stream.
      }
      if (row.id == null) return;
      // CHAT-07: defensive client-side dedup by message id -- the server
      // (Plan 01-08's race-free DB-backed pump) already guarantees no
      // duplicate/gap, but a reconnect could in principle redeliver
      // something already rendered.
      if (seenIdsRef.current.has(row.id)) return;
      seenIdsRef.current.add(row.id);
      setMessages((prev) => [...prev, row]);
    });

    es.onerror = () => {
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current > RECONNECT_ERROR_THRESHOLD) {
        setIsReconnecting(true);
      }
      // Deliberately no manual close()/reconnect here -- EventSource's
      // native reconnect (with native Last-Event-ID replay) does this on
      // its own; hand-rolling it here would fight the platform.
    };

    return () => {
      es.close();
      setEventSource(null);
    };
  }, [url]);

  return { messages, isReconnecting, eventSource };
}
