// ADMIN-03/D-12: the flat, unfiltered conversation list -- the first of the
// three minimal owner screens (login/setup are Plan 01-07's). proxy.ts
// already guards every /admin/:path* route at the network edge, but this
// page still calls requireOwner() defensively rather than assuming it is
// unreachable any other way.
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/auth/guard";
import { listWithPreview } from "@/server/repo/conversations";
import { statsByPlatform } from "@/server/repo/gateFunnel";
import { ConversationRow } from "@/components/admin/ConversationRow";
import { GateFunnelStats } from "@/components/admin/GateFunnelStats";

export const dynamic = "force-dynamic";

export default async function AdminConversationListPage() {
  const owner = await requireOwner();
  if (!owner) {
    redirect("/admin/login");
  }

  const [conversations, funnelStats] = await Promise.all([listWithPreview(), statsByPlatform()]);

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <header className="px-4 py-8">
        <h1 className="text-[20px] leading-[1.3] font-semibold text-foreground">Conversations</h1>
      </header>

      <GateFunnelStats stats={funnelStats} />

      {conversations.length === 0 ? (
        // UI-SPEC.md Copywriting Contract's exact locked empty-state heading
        // and body -- 2xl (48px) vertical inset per the Spacing Scale.
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
          <h2 className="text-[20px] leading-[1.3] font-semibold text-foreground">No conversations yet</h2>
          <p className="text-[14px] leading-[1.4] font-normal text-muted-foreground">
            When someone opens the chat and sends a message, it will appear here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 px-4 pb-8">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <ConversationRow
                id={conversation.id}
                lastMessageBody={conversation.lastMessageBody}
                lastMessageAt={conversation.lastMessageAt}
                unreachable={conversation.unreachable}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
