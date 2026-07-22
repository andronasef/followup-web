// ADMIN-03/D-13: the owner-scoped SSE firehose -- same shape as
// src/app/api/chat/stream/route.ts (subscribe-before-backfill, req.signal
// abort cleanup, ~4-minute D-15 recycle, DB-backed pump so live and
// backfilled messages can never duplicate or gap), but hub.subscribeAll()
// instead of hub.subscribe(conversationId, ...) and repo.messages.sinceAll
// instead of the per-conversation since() -- the owner sees every
// conversation's events on one connection, per D-13.
import type { NextRequest } from "next/server";
import { requireOwner } from "../../../../server/auth/guard.ts";
import * as hub from "../../../../server/realtime/hub.ts";
import { createPump } from "../../../../server/realtime/sse-pump.ts";
import { sinceAll } from "../../../../server/repo/messages.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 20_000;
const RECYCLE_AFTER_MS = 4 * 60 * 1000;

export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  if (!owner) {
    return new Response(null, { status: 401 });
  }

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

      // Same shared pump as the visitor stream (CR-04/CR-05), only over
      // sinceAll() instead of the per-conversation since(). See
      // sse-pump.ts for why it never rejects and has no live/not-live gate.
      const pump = createPump({
        sinceId,
        fetchSince: (id) => sinceAll(id),
        emit: (row) => send(row.id, "message", row),
        onError: (error) => {
          // CLAUDE.md: ids and status only, NEVER message bodies.
          console.error("[sse] admin pump failed", {
            lastEmittedId: pump.highWaterMark(),
            error: error instanceof Error ? error.message : "unknown",
          });
          // Recycle deliberately -- EventSource reconnects and replays
          // from its Last-Event-ID.
          cleanup();
        },
      });

      // Subscribe BEFORE the backfill run below -- same literal ordering
      // requirement as the visitor stream.
      unsubscribe = hub.subscribeAll((event) => {
        if (event.type === "message") {
          pump.trigger();
          return;
        }
        if (event.type === "presence") {
          send(null, "presence", event.payload);
        }
      });

      await pump.run(); // initial Last-Event-ID backfill across every conversation

      heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, HEARTBEAT_INTERVAL_MS);

      // D-15: deliberate routine recycle, not an error close.
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
