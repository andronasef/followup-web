// CHAT-04/CHAT-07: visitor-scoped SSE stream. Subscribes to the hub BEFORE
// running the Last-Event-ID backfill query (01-RESEARCH.md Pattern 2) so no
// message committed in the gap between subscribing and finishing backfill
// is lost or duplicated -- repo.messages.since (the DB) is re-queried for
// anything that arrived during that gap rather than trusting buffered hub
// event objects, since the DB is the single source of ordering truth
// (FOUND-02). Deliberately recycles the stream every ~4 minutes (D-15) so
// EventSource's native reconnect + Last-Event-ID replay is a routine,
// continuously-exercised path rather than a rare recovery branch only ever
// hit during a real Traefik/proxy failure.
import type { NextRequest } from "next/server";
import { requireVisitor } from "../../../../server/auth/visitor.ts";
import * as hub from "../../../../server/realtime/hub.ts";
import { createPump } from "../../../../server/realtime/sse-pump.ts";
import { since } from "../../../../server/repo/messages.ts";
import { getPresence } from "../../../../server/repo/responders.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 20_000;
const RECYCLE_AFTER_MS = 4 * 60 * 1000;

export async function GET(request: NextRequest) {
  const session = await requireVisitor();
  const conversation = session.conversation;
  if (!conversation) {
    // No cookie could be resolved into a conversation -- nothing to stream.
    return new Response(null, { status: 401 });
  }
  // Captured as a plain number -- TS does not carry the null-check
  // narrowing above into the nested pump() function declaration below.
  const conversationId = conversation.id;

  const sinceHeader = request.headers.get("last-event-id");
  const parsedSince = sinceHeader ? Number(sinceHeader) : 0;
  const sinceId = Number.isFinite(parsedSince) ? parsedSince : 0;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let recycleTimer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      if (request.signal.aborted) {
        // Client already gone before the stream even started (a real,
        // if rare, race) -- nothing to subscribe to or clean up yet.
        try {
          controller.close();
        } catch {
          // Already closed -- fine.
        }
        return;
      }

      const send = (id: number | null, event: string, data: unknown) => {
        if (closed) return;
        const idLine = id !== null ? `id: ${id}\n` : "";
        controller.enqueue(encoder.encode(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        if (recycleTimer) clearTimeout(recycleTimer);
        try {
          controller.close();
        } catch {
          // Already closed by the platform (client disconnect race) -- fine.
        }
      };

      // The shared DB-backed pump (CR-04/CR-05): always re-queries
      // repo.messages.since from the last emitted id, never rejects, and
      // has no live/not-live gate -- a message committed during the
      // backfill run is picked up by that same run. See sse-pump.ts.
      const pump = createPump({
        sinceId,
        fetchSince: (id) => since(conversationId, id),
        emit: (row) => send(row.id, "message", row),
        onError: (error) => {
          // CLAUDE.md: ids and status only, NEVER message bodies -- a
          // pastoral transcript must not reach the platform log viewer.
          console.error("[sse] chat pump failed", {
            conversationId,
            lastEmittedId: pump.highWaterMark(),
            error: error instanceof Error ? error.message : "unknown",
          });
          // Recycle deliberately rather than limping on: the browser's
          // EventSource reconnects and replays from its Last-Event-ID, so
          // "no message is ever lost" survives a DB blip.
          cleanup();
        },
      });

      // Subscribe BEFORE the backfill run below -- this is the literal
      // ordering the plan's acceptance criteria requires. The trigger is
      // now unconditional; the pump itself owns the single-flight/re-run
      // handoff.
      unsubscribe = hub.subscribe(conversationId, (event) => {
        if (event.type !== "message") return;
        pump.trigger();
      });

      // D-06/D-07: one initial presence read on connect. Never carries an
      // id -- only message events advance the Last-Event-ID cursor.
      const isOwnerOnline = await getPresence();
      send(null, "presence", { isOwnerOnline });

      await pump.run(); // initial Last-Event-ID backfill

      heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, HEARTBEAT_INTERVAL_MS);

      // D-15: deliberate routine recycle, not an error close -- the
      // browser's built-in EventSource reconnect + Last-Event-ID replay
      // picks up from here on its own.
      recycleTimer = setTimeout(cleanup, RECYCLE_AFTER_MS);

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      if (recycleTimer) clearTimeout(recycleTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
