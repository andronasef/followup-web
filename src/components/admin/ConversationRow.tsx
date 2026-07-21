// ADMIN-03/D-12/D-18: one row in the flat conversation list. No status
// badge, no faith-decision flag, no filter chip -- that surface is Phase
// 3's (ADMIN-05..11). The preview truncates via Tailwind's logical-property
// combo (`truncate` + `text-start`), never a hardcoded `text-align: left`,
// so it reads correctly at both the inline-start and inline-end under RTL
// (UI-SPEC.md's long-text/admin-list-preview backstop row). Plan 02-08 adds
// an optional, purely informational "Unreachable" badge (D-19 -- no
// retry/re-notify action) between the preview text and the timestamp.
import Link from "next/link";
import { BellOff } from "lucide-react";
import { formatDigits } from "@/lib/i18n/format";

export interface ConversationRowProps {
  id: number;
  lastMessageBody: string | null;
  lastMessageAt: string | number | Date;
  /** OPS-11/D-18: true when this visitor was once granted push and now has zero live subscriptions. Purely informational -- no action. */
  unreachable?: boolean;
}

function formatTime(value: ConversationRowProps["lastMessageAt"]): string {
  const date = value instanceof Date ? value : new Date(value);
  const hh = formatDigits(date.getHours());
  const mm = formatDigits(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function ConversationRow({ id, lastMessageBody, lastMessageAt, unreachable }: ConversationRowProps) {
  return (
    <Link
      href={`/admin/c/${id}`}
      className="flex items-center gap-4 rounded-lg bg-muted px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-primary/50"
    >
      <p
        dir="auto"
        className="min-w-0 flex-1 truncate text-start text-[14px] leading-[1.4] font-normal text-foreground"
      >
        {lastMessageBody ?? "No messages yet"}
      </p>
      {unreachable ? (
        <span
          aria-label="This visitor's push notifications are no longer working"
          className="flex shrink-0 items-center gap-1 text-[14px] leading-[1.4] font-normal text-muted-foreground"
        >
          <BellOff aria-hidden="true" className="size-3.5" />
          Unreachable
        </span>
      ) : null}
      <span dir="ltr" className="shrink-0 text-[14px] leading-[1.4] font-normal text-muted-foreground">
        {formatTime(lastMessageAt)}
      </span>
    </Link>
  );
}
