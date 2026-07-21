// PUSH-01/OPS-11: push-gate funnel tracking. Each stage timestamp is set
// AT MOST ONCE per visitor -- a single INSERT ... ON CONFLICT ... DO UPDATE
// SET <col> = COALESCE(existing, new) statement (mirrors ratelimit.ts's
// race-free single-statement upsert shape, substituting COALESCE-set-once
// semantics for LEAST-refill semantics). This is the ID-03 must-have truth:
// concurrent or repeated recordShown/recordPromptReached/recordGranted
// calls for the same visitor never move an already-set stage timestamp.
import { sql } from "../db/pool.ts";

export type GatePlatform = "ios" | "other";

export interface PlatformFunnelStats {
  platform: string;
  shown: number;
  promptReached: number;
  granted: number;
}

export async function recordShown(visitorId: string, platform: GatePlatform): Promise<void> {
  await sql`
    insert into push_gate_funnel (visitor_id, platform, shown_at)
    values (${visitorId}, ${platform}, now())
    on conflict (visitor_id) do update set
      shown_at = coalesce(push_gate_funnel.shown_at, excluded.shown_at)
  `;
}

export async function recordPromptReached(visitorId: string, platform: GatePlatform): Promise<void> {
  await sql`
    insert into push_gate_funnel (visitor_id, platform, prompt_reached_at)
    values (${visitorId}, ${platform}, now())
    on conflict (visitor_id) do update set
      prompt_reached_at = coalesce(push_gate_funnel.prompt_reached_at, excluded.prompt_reached_at)
  `;
}

export async function recordGranted(visitorId: string, platform: GatePlatform): Promise<void> {
  await sql`
    insert into push_gate_funnel (visitor_id, platform, granted_at)
    values (${visitorId}, ${platform}, now())
    on conflict (visitor_id) do update set
      granted_at = coalesce(push_gate_funnel.granted_at, excluded.granted_at)
  `;
}

/**
 * ADMIN-stats: all-time (no date-range filter, per D-17) counts of each
 * funnel stage, grouped by platform. Recomputed fresh on every call -- no
 * caching.
 *
 * A platform with zero visitors produces NO row in this result (a GROUP BY
 * over zero matching rows has nothing to group) -- it is NOT synthesized
 * here as a literal-0 row, because push_gate_funnel has no independent
 * platform-catalog table to LEFT JOIN against. Plan 02-08's stats-row
 * consumer is responsible for rendering a 0 row for any platform absent
 * from this result (e.g. by iterating a fixed ['ios', 'other'] list and
 * defaulting missing entries to 0), not this function.
 */
export async function statsByPlatform(): Promise<PlatformFunnelStats[]> {
  const rows = await sql<{ platform: string; shown: string; prompt_reached: string; granted: string }[]>`
    select
      platform,
      count(shown_at) as shown,
      count(prompt_reached_at) as prompt_reached,
      count(granted_at) as granted
    from push_gate_funnel
    group by platform
  `;

  return rows.map((row) => ({
    platform: row.platform,
    shown: Number(row.shown),
    promptReached: Number(row.prompt_reached),
    granted: Number(row.granted),
  }));
}
