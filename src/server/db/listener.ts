// Dedicated LISTEN-only connection — deliberately separate from the query
// pool (pool.ts). FOUND-02: exactly one connection here (`max: 1`),
// decoupled from the number of SSE subscribers.
//
// Do NOT import the node-postgres Client class here. postgres.js's
// `sql.listen()` already owns dedicated-connection management, reconnect-with-backoff, and
// a reconnect-replay hook (`onListen` re-fires on every reconnect, not just
// the first connect) — see 01-RESEARCH.md Pattern 1. Hand-rolling that on
// top of the driver chosen specifically to avoid it would defeat the point.
import postgres from "postgres";
import { publishChat, publishPresence } from "../realtime/hub";

type ChatNotifyPayload = { c: number; m: number; k: "message" };

const globalForListener = globalThis as unknown as {
  __onechatListenerSql?: ReturnType<typeof postgres>;
  __onechatListenerStarted?: boolean;
};

const listenSql =
  globalForListener.__onechatListenerSql ?? postgres(process.env.DATABASE_URL ?? "", { max: 1 });

if (process.env.NODE_ENV !== "production") {
  globalForListener.__onechatListenerSql = listenSql;
}

/**
 * Boots the dedicated LISTEN connection. Called exactly once at process
 * boot from src/instrumentation.ts; guarded against double-registration
 * across dev's hot-reload cycles (globalThis persists across module
 * re-evaluation, the module cache does not).
 */
export async function startListener(): Promise<void> {
  if (globalForListener.__onechatListenerStarted) return;
  globalForListener.__onechatListenerStarted = true;

  await listenSql.listen(
    "chat",
    (payload) => {
      try {
        const p = JSON.parse(payload) as ChatNotifyPayload;
        publishChat(p.c, p.m, p.k);
      } catch (error) {
        console.error("[listener] failed to parse chat notify payload", error);
      }
    },
    () => {
      // Fires on initial connect AND every reconnect. This is the FOUND-02
      // "replay on reconnect" hook — but the listener itself does not
      // replay anything: each SSE client's own Last-Event-ID backfill
      // (Plan 01-08) is what recovers missed events. This callback stays
      // log-only by design.
      console.log("[listener] ready (chat)");
    },
  );

  await listenSql.listen("presence", (payload) => {
    try {
      publishPresence(JSON.parse(payload) as Record<string, unknown>);
    } catch (error) {
      console.error("[listener] failed to parse presence notify payload", error);
    }
  });
}
