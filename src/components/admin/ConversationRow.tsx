// ADMIN-03/D-12: one row in the flat conversation list. No status badge, no
// faith-decision flag, no filter chip -- that surface is Phase 3's
// (ADMIN-05..11). The preview truncates via Tailwind's logical-property
// combo (`truncate` + `text-start`), never a hardcoded `text-align: left`,
// so it reads correctly at both the inline-start and inline-end under RTL
// (UI-SPEC.md's long-text/admin-list-preview backstop row).
import Link from "next/link";
import { formatDigits } from "@/lib/i18n/format";

export interface ConversationRowProps {
  id: number;
  lastMessageBody: string | null;
  lastMessageAt: string | number | Date;
}

function formatTime(value: ConversationRowProps["lastMessageAt"]): string {
  const date = value instanceof Date ? value : new Date(value);
  const hh = formatDigits(date.getHours());
  const mm = formatDigits(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function ConversationRow({ id, lastMessageBody, lastMessageAt }: ConversationRowProps) {
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
      <span dir="ltr" className="shrink-0 text-[14px] leading-[1.4] font-normal text-muted-foreground">
        {formatTime(lastMessageAt)}
      </span>
    </Link>
  );
}
