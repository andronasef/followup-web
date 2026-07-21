// CHAT-01/CHAT-08: the one fully public, unauthenticated surface this
// product exposes. A Server Component so the visitor's message history is
// fetched server-side and present in the very first HTML response -- never
// waiting on the client to open the SSE stream just to see a returning
// visitor's own prior conversation. Supersedes Plan 01-01's placeholder.
import { requireVisitor } from "@/server/auth/visitor";
import { since } from "@/server/repo/messages";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/server/i18n/detect";
import { ChatShell } from "@/components/chat/ChatShell";
import type { ChatStreamMessage } from "@/lib/chat/useChatStream";

// Reading the visitor cookie already forces dynamic rendering, but this
// route's entire point is per-visitor content -- never cacheable/ISR'd.
export const dynamic = "force-dynamic";

function resolveLang(lang: string): SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang) ? (lang as SupportedLanguage) : "en";
}

export default async function Page() {
  // allowCookieWrite:false -- a Server Component render cannot call
  // cookies().set() (Next.js throws; see requireVisitor's own doc comment
  // and layout.tsx's identical pattern). A brand-new visitor's cookie is
  // only ever issued by the client-side bootstrap
  // (src/app/pre-paint.ts -> POST /api/visitor/bootstrap), never from this
  // render -- so a missing/invalid cookie here renders safe detected-
  // language defaults and an empty history, not an orphaned DB write.
  const session = await requireVisitor({ allowCookieWrite: false });
  const lang = resolveLang(session.lang);

  // T-01-34: scoped exclusively to THIS request's own requireVisitor()-
  // resolved conversation id -- never a query param or any other
  // client-suppliable input -- so one visitor's page can never render
  // another visitor's history.
  const initialMessages: ChatStreamMessage[] = session.conversation
    ? (await since(session.conversation.id, 0)).map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        // messages.sender is a plain `text` column (a Postgres CHECK
        // constraint, not a typed enum, guards its values -- see
        // schema.ts) so drizzle infers `string`, not the narrower union
        // ChatStreamMessage expects (same cast precedent as the admin
        // thread page, src/app/admin/(auth)/c/[id]/page.tsx).
        sender: message.sender as ChatStreamMessage["sender"],
        body: message.body,
        clientMsgId: message.clientMsgId,
        createdAt: message.createdAt.toISOString(),
        translation: message.translation,
      }))
    : [];

  return <ChatShell initialLang={lang} initialAppearance={session.appearance as "light" | "dark" | "system"} initialMessages={initialMessages} />;
}
