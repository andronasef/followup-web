// Pure in-process pub-sub. Holds zero DB connections and makes zero DB
// queries — subscribing here is pure memory (see 01-RESEARCH.md's
// Architectural Responsibility Map: "hub subscription is pure memory").
// SSE route handlers (Plan 01-08) hold only a subscription into this
// module; the dedicated LISTEN connection (db/listener.ts) is the only
// thing that ever calls publishChat/publishPresence.

export type HubEvent =
  | { type: "message"; conversationId: number; messageId: number }
  | { type: "presence"; payload: Record<string, unknown> };

/** A subscriber is just a callback — SSE routes type their handler against this. */
export type Subscriber = (event: HubEvent) => void;

type Unsubscribe = () => void;

// The subscriber maps MUST be a single process-wide singleton. In Next's
// standalone build the module graph reachable from instrumentation.ts (which
// imports db/listener.ts -> this hub, the ONLY caller of publishChat/
// publishPresence) can be bundled separately from the module graph reachable
// from the app's SSE route handlers (the ONLY callers of subscribe/
// subscribeAll). A plain module-level `new Map()` then yields TWO distinct
// hub instances: the listener publishes into one set of maps while every SSE
// connection is registered on the other, so live events are never delivered
// even though DB-backed Last-Event-ID backfill and the heartbeat timer both
// keep working (they don't depend on the hub). Pinning the state on globalThis
// makes both graphs share one set of maps -- the same singleton discipline
// db/listener.ts already applies to its LISTEN connection.
const globalForHub = globalThis as unknown as {
  __onechatHubPerConversation?: Map<number, Set<Subscriber>>;
  __onechatHubFirehose?: Set<Subscriber>;
};

// Per-conversation scope — visitor-side SSE routes subscribe here.
const perConversation: Map<number, Set<Subscriber>> =
  globalForHub.__onechatHubPerConversation ?? (globalForHub.__onechatHubPerConversation = new Map());

// Admin firehose scope (D-13) — the owner side subscribes to everything,
// regardless of conversation.
const firehose: Set<Subscriber> =
  globalForHub.__onechatHubFirehose ?? (globalForHub.__onechatHubFirehose = new Set());

/** Subscribe to one conversation's events. Returns an unsubscribe handle. */
export function subscribe(conversationId: number, subscriber: Subscriber): Unsubscribe {
  let subs = perConversation.get(conversationId);
  if (!subs) {
    subs = new Set();
    perConversation.set(conversationId, subs);
  }
  subs.add(subscriber);

  return () => {
    subs?.delete(subscriber);
    if (subs && subs.size === 0) perConversation.delete(conversationId);
  };
}

/** Subscribe to every conversation's events (admin firehose, D-13). */
export function subscribeAll(subscriber: Subscriber): Unsubscribe {
  firehose.add(subscriber);
  return () => firehose.delete(subscriber);
}

/** Notify every per-conversation subscriber AND every admin-scope subscriber. */
export function publishChat(
  conversationId: number,
  messageId: number,
  kind: "message" = "message",
): void {
  const event: HubEvent = { type: kind, conversationId, messageId };

  const subs = perConversation.get(conversationId);
  if (subs) for (const subscriber of subs) subscriber(event);
  for (const subscriber of firehose) subscriber(event);
}

/** Notify every subscriber, both scopes, with a presence event. */
export function publishPresence(payload: Record<string, unknown>): void {
  const event: HubEvent = { type: "presence", payload };

  for (const subs of perConversation.values()) {
    for (const subscriber of subs) subscriber(event);
  }
  for (const subscriber of firehose) subscriber(event);
}
