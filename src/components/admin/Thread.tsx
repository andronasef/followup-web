"use client";

// ADMIN-03/D-13: the owner's thread view. Reuses
// src/components/chat/MessageBubble.tsx for individual message rendering
// (bidi isolation, ASCII-digit timestamps) instead of duplicating that
// logic -- T-01-33's mitigation: no dangerouslySetInnerHTML is introduced on
// the admin side either. No translation UI exists yet (ADMIN-09 is Phase
// 2) -- messages render as their original stored text only.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MessageBubble } from "@/components/chat/MessageBubble";

export interface ThreadMessage {
  id: number;
  conversationId: number;
  sender: "visitor" | "owner";
  body: string;
  clientMsgId: string | null;
  createdAt: string | number | Date;
}

export interface ThreadProps {
  conversationId: number;
  initialMessages: ThreadMessage[];
}

export function Thread({ conversationId, initialMessages }: ThreadProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-2 px-4 py-2">
        <Link
          href="/admin"
          aria-label="Back to conversations"
          className="flex size-11 items-center justify-center text-foreground outline-none focus-visible:ring-3 focus-visible:ring-primary/50"
        >
          <ChevronLeft aria-hidden="true" className="rtl:-scale-x-100" />
        </Link>
        <h1 className="text-[20px] leading-[1.3] font-semibold text-foreground">Conversation</h1>
      </header>
      <div ref={containerRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-2">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}
