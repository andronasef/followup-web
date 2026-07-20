"use client";

// D-06/D-07: presence as a small external store, not component state. The
// SSE EventSource itself is owned and managed by Plan 01-10's
// useChatStream — the same open connection chat/stream/route.ts already
// emits a "presence" event on (see src/app/api/chat/stream/route.ts's
// `send(null, "presence", { isOwnerOnline })`). This module is the seam
// between the two standalone plans: whatever owns that EventSource calls
// setPresence() on every "presence" event; Welcome and PresenceLine call
// usePresence() to read the live value. Plan 01-12 wires the two together
// by importing both — neither this file nor useChatStream needs to import
// or modify the other.
import { useSyncExternalStore } from "react";

type Listener = () => void;

let isOwnerOnline = false;
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return isOwnerOnline;
}

function getServerSnapshot(): boolean {
  // D-07: never claim the owner is present when they are not — before any
  // live SSE "presence" event has arrived, the honest default is offline.
  return false;
}

/**
 * Called by whatever owns the chat SSE stream on every "presence" event
 * (isOwnerOnline from the event payload). Not called by this hook's own
 * consumers.
 */
export function setPresence(next: boolean): void {
  if (next === isOwnerOnline) return;
  isOwnerOnline = next;
  for (const listener of listeners) listener();
}

/** Reads the live, SSE-derived "is the owner online right now" state. */
export function usePresence(): { isOwnerOnline: boolean } {
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { isOwnerOnline: value };
}
