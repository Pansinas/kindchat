"use client";

import Link from "next/link";
import { ChatPanel } from "@/components/chat/chat-panel";
import { SyncUnread } from "@/components/founder/sync-unread";
import { useAppState } from "@/components/providers/app-state-provider";
import { ConversationProvider } from "@/components/providers/conversation-provider";
import { Button } from "@/components/ui/button";

/** A user's private chat with the KindChat founder. */
export function TeamChatView() {
  const { state, userId, refresh } = useAppState();

  if (state.is_founder) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">You&apos;re the founder</h1>
        <p className="max-w-sm text-muted-foreground">Your conversations with every user are in your inbox.</p>
        <Button asChild>
          <Link href="/inbox">Open inbox</Link>
        </Button>
      </div>
    );
  }

  const chat = state.founder_chat;
  if (!chat) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">KindChat team</h1>
        <p className="max-w-sm text-muted-foreground">This chat isn&apos;t available yet. Please check back soon.</p>
      </div>
    );
  }

  return (
    <ConversationProvider
      key={chat.conversation_id}
      conversationId={chat.conversation_id}
      userId={userId}
      partnerId={chat.founder.id}
      partnerName={chat.founder.display_name}
      partnerTimezone={chat.founder.timezone}
      settings={state.settings}
      kind="founder"
    >
      <SyncUnread onRead={() => void refresh()} />
      <ChatPanel
        partner={chat.founder}
        backHref="/dashboard"
        badge="Founder"
        emptyTitle="KindChat team"
        emptyBody="Questions, ideas or problems? Message the founder of KindChat here."
      />
    </ConversationProvider>
  );
}
