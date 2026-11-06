"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ChatHeader } from "@/components/chat/chat-header";
import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { useAppState } from "@/components/providers/app-state-provider";
import { useOptionalConversation } from "@/components/providers/conversation-provider";
import { Button } from "@/components/ui/button";

export function ChatView() {
  const { state } = useAppState();
  const conversation = useOptionalConversation();
  const setChatOpen = conversation?.setChatOpen;
  const markRead = conversation?.markRead;

  useEffect(() => {
    if (!setChatOpen) return;
    setChatOpen(true);
    markRead?.();
    return () => setChatOpen(false);
  }, [setChatOpen, markRead]);

  if (!state.couple || !conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">No conversation yet</h1>
        <p className="max-w-sm text-muted-foreground">Connect with your partner first. Your private chat opens as soon as you both agree.</p>
        <Button asChild>
          <Link href="/connect">Connect with your partner</Link>
        </Button>
      </div>
    );
  }

  const partner = state.couple.partner;
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ChatHeader partner={partner} />
      <MessageList partnerName={partner.display_name} />
      <Composer partnerName={partner.display_name} />
    </div>
  );
}
