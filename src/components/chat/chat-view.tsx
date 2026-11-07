"use client";

import Link from "next/link";
import { ChatPanel } from "@/components/chat/chat-panel";
import { useAppState } from "@/components/providers/app-state-provider";
import { useOptionalConversation } from "@/components/providers/conversation-provider";
import { Button } from "@/components/ui/button";

export function ChatView() {
  const { state } = useAppState();
  const conversation = useOptionalConversation();

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

  return <ChatPanel partner={state.couple.partner} backHref="/dashboard" />;
}
