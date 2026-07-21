// ADMIN-03: the thread view. requireOwner() is called defensively before
// any DB access (T-01-32's mitigation), even though proxy.ts already guards
// every /admin/:path* route at the network edge. The message history is
// fetched server-side via repo.messages.since -- the exact same query Plan
// 01-08's SSE backfill and the D-16 polling fallback use -- so the initial
// render carries real data without waiting for the SSE connection to open.
import { notFound, redirect } from "next/navigation";
import { requireOwner } from "@/server/auth/guard";
import { since } from "@/server/repo/messages";
import { Thread, type ThreadMessage } from "@/components/admin/Thread";

export const dynamic = "force-dynamic";

interface AdminConversationPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminConversationPage({ params }: AdminConversationPageProps) {
  const owner = await requireOwner();
  if (!owner) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    notFound();
  }

  const rows = await since(conversationId, 0);
  // messages.sender is a plain `text` column (a Postgres CHECK constraint,
  // not a typed enum, guards its values -- see schema.ts) so drizzle infers
  // `string`, not the narrower union ThreadMessage/MessageBubble expect.
  const messages: ThreadMessage[] = rows.map((row) => ({
    ...row,
    sender: row.sender as ThreadMessage["sender"],
    translation: row.translation,
  }));

  return <Thread conversationId={conversationId} initialMessages={messages} />;
}
