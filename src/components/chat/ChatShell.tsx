"use client";

// Plan 01-12: the one client boundary that wires every standalone component
// from Plans 01-09/01-10 into the single public page (CHAT-01). This is the
// one place useChatStream() is instantiated (exactly once) and its raw
// EventSource is where a "presence" listener attaches, forwarding into
// usePresence's setPresence() -- the seam both 01-09 (Welcome/PresenceLine,
// which already call usePresence() to read) and 01-10 (useChatStream, which
// deliberately exposes the raw EventSource instead of importing
// usePresence.ts) built for but left unconnected until this plan (see both
// plans' SUMMARY.md "Next Phase Readiness").
import { useEffect, useMemo, useState } from "react";
import { Gate } from "./Gate";
import { Header } from "./Header";
import { LanguageSheet } from "./LanguageSheet";
import { Welcome } from "./Welcome";
import { PresenceLine } from "./PresenceLine";
import { MessageList, type MessageListItem } from "./MessageList";
import { Composer } from "./Composer";
import { useChatStream, type ChatStreamMessage } from "@/lib/chat/useChatStream";
import { setPresence } from "@/lib/chat/usePresence";
import { getStrings } from "@/lib/i18n/strings";
import { dirFor } from "@/server/i18n/dir";
import type { SupportedLanguage } from "@/server/i18n/detect";

export interface ChatShellProps {
  initialLang: SupportedLanguage;
  initialAppearance: "light" | "dark" | "system";
  /** Server-fetched via repo.messages.since(conversationId, 0) -- present in the very first HTML response (CHAT-08), never an empty array awaiting the first client fetch. */
  initialMessages: ChatStreamMessage[];
}

export function ChatShell({ initialLang, initialAppearance, initialMessages }: ChatShellProps) {
  const [lang, setLang] = useState(initialLang);
  const [isDark, setIsDark] = useState(initialAppearance === "dark");
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  const strings = getStrings(lang);

  // 'system' can't be resolved server-side (no reliable OS signal -- see
  // layout.tsx/pre-paint.ts's identical constraint for the <html> class).
  // pre-paint.ts already corrects <html>'s class before first paint; this
  // corrects this component's own isDark state (which drives Header's
  // Sun/Moon icon) once, after mount, the same way.
  useEffect(() => {
    if (initialAppearance !== "system") return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, [initialAppearance]);

  // The one useChatStream() instantiation for this whole page.
  const { messages: liveMessages, isReconnecting, eventSource } = useChatStream();

  // The one place Plan 01-09's presence UI and Plan 01-10's SSE stream
  // connect: attach a "presence" listener to the exact same EventSource
  // useChatStream owns (rather than opening a second connection), forwarding
  // into usePresence's module store that Welcome/PresenceLine already read.
  useEffect(() => {
    if (!eventSource) return;
    const handlePresence = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { isOwnerOnline: boolean };
        setPresence(Boolean(payload.isOwnerOnline));
      } catch {
        // Malformed payload -- ignore rather than crash the listener.
      }
    };
    eventSource.addEventListener("presence", handlePresence);
    return () => eventSource.removeEventListener("presence", handlePresence);
  }, [eventSource]);

  // chat/stream/route.ts's initial Last-Event-ID backfill always replays the
  // FULL history from id 0 on a brand-new connection (no Last-Event-ID
  // header yet) -- so once useChatStream has received any live message, its
  // own `messages` array already IS the complete transcript. Switching
  // entirely (never concatenating initialMessages + liveMessages) is what
  // keeps the server-fetched history from ever rendering twice; before that
  // first backfill lands, the server-fetched initialMessages is what's
  // shown, satisfying "history renders before the SSE connection even
  // opens".
  const messages = liveMessages.length > 0 ? liveMessages : initialMessages;

  const messageListItems = useMemo<MessageListItem[]>(
    () =>
      messages.map((message) => ({
        id: message.id,
        sender: message.sender,
        body: message.body,
        createdAt: message.createdAt,
      })),
    [messages],
  );

  // Every clientMsgId already visible in the durable, SSE-confirmed
  // transcript -- passed to Composer so a just-sent message never renders
  // twice: once as Composer's own local optimistic bubble, once as the
  // durable row this same connection's own SSE echo delivers back (the
  // visitor's own conversation is subscribed to its own messages).
  const confirmedClientMsgIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      if (message.clientMsgId) ids.add(message.clientMsgId);
    }
    return ids;
  }, [messages]);

  function handleLanguageChange(next: SupportedLanguage) {
    setLang(next);
    // Header's own appearance toggle mutates document.documentElement
    // directly on success (see Header.tsx) -- mirroring that same imperative
    // pattern here for lang/dir, since <html> itself is rendered by
    // layout.tsx (a Server Component above this client boundary).
    document.documentElement.lang = next;
    document.documentElement.dir = dirFor(next);
  }

  return (
    <Gate>
      <div className="flex min-h-dvh flex-col bg-background">
        <Header
          lang={lang}
          isDark={isDark}
          onOpenLanguageSheet={() => setLanguageSheetOpen(true)}
          onAppearanceChange={setIsDark}
        />
        <LanguageSheet
          lang={lang}
          open={languageSheetOpen}
          onOpenChange={setLanguageSheetOpen}
          onLanguageChange={handleLanguageChange}
        />
        <Welcome lang={lang} />
        <PresenceLine lang={lang} />
        <MessageList messages={messageListItems} />
        {isReconnecting && (
          <p className="px-4 pb-1 text-[14px] leading-[1.4] font-normal text-muted-foreground">
            {strings.errorReconnectStuck}
          </p>
        )}
        <Composer lang={lang} confirmedClientMsgIds={confirmedClientMsgIds} />
      </div>
    </Gate>
  );
}
