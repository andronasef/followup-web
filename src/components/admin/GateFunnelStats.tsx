// OPS-11/D-17: the all-time, no-date-range-filter push-gate funnel stats
// row on the existing conversation-list screen (no new admin screen).
// Component-local hardcoded English copy, matching Phase 1's
// ReplyBox.tsx/ConversationRow.tsx precedent -- admin UI is never
// localized. Numbers always render via formatDigits() (ASCII digits, no
// thousands separators, per D-17's resolved discretion).
import { formatDigits } from "@/lib/i18n/format";
import type { GatePlatform, PlatformFunnelStats } from "@/server/repo/gateFunnel";

export interface GateFunnelStatsProps {
  stats: PlatformFunnelStats[];
}

const PLATFORMS: { key: GatePlatform; label: string }[] = [
  { key: "ios", label: "iOS" },
  { key: "other", label: "Other" },
];

const ZERO_STATS: Omit<PlatformFunnelStats, "platform"> = { shown: 0, promptReached: 0, granted: 0 };

function statsFor(stats: PlatformFunnelStats[], platform: GatePlatform): Omit<PlatformFunnelStats, "platform"> {
  const row = stats.find((s) => s.platform === platform);
  return row ?? ZERO_STATS;
}

export function GateFunnelStats({ stats }: GateFunnelStatsProps) {
  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      {PLATFORMS.map(({ key, label }) => {
        const row = statsFor(stats, key);
        return (
          <div key={key} className="flex items-center gap-4 rounded-lg bg-muted px-4 py-3">
            <span className="w-14 shrink-0 text-[14px] leading-[1.4] font-normal text-foreground">{label}</span>
            <div className="flex flex-1 items-center gap-4">
              <span className="text-[14px] leading-[1.4] font-normal text-muted-foreground">
                Shown <span dir="ltr">{formatDigits(row.shown)}</span>
              </span>
              <span className="text-[14px] leading-[1.4] font-normal text-muted-foreground">
                Reached prompt <span dir="ltr">{formatDigits(row.promptReached)}</span>
              </span>
              <span className="text-[14px] leading-[1.4] font-normal text-muted-foreground">
                Granted <span dir="ltr">{formatDigits(row.granted)}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
