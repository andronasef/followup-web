// OPS-11: gate-funnel beacon endpoint. `next/headers`-free (same split
// rationale as subscribe.ts) so node:test can import this directly.
//
// T-02-10 (kept per threat_model): a replayed beacon is capped to a no-op
// by gateFunnel's own COALESCE-based set-once upsert -- no separate
// anti-replay token is needed here.
import { z } from "zod";
import * as gateFunnel from "../repo/gateFunnel.ts";

const gateEventSchema = z.object({
  kind: z.enum(["shown", "prompt_reached"]),
  platform: z.enum(["ios", "other"]),
});

export interface HandleGateEventInput {
  visitorId: string;
  rawBody: unknown;
}

export type HandleGateEventResult = { status: 200 } | { status: 400; body: { error: string } };

export async function handleGateEvent(input: HandleGateEventInput): Promise<HandleGateEventResult> {
  const parsed = gateEventSchema.safeParse(input.rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "invalid_body" } };
  }

  const { kind, platform } = parsed.data;
  if (kind === "shown") {
    await gateFunnel.recordShown(input.visitorId, platform);
  } else {
    await gateFunnel.recordPromptReached(input.visitorId, platform);
  }

  return { status: 200 };
}
