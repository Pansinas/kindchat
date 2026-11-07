"use client";

import { useEffect } from "react";
import { ChatHeader } from "@/components/chat/chat-header";
import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { useConversation } from "@/components/providers/conversation-provider";
import type { ProfileCard } from "@/types/app";

interface Props {
  partner: ProfileCard;
  backHref: string;
  badge?: string;
  alwaysShowBack?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
}

/** Header + history + composer for whichever conversation the nearest provider holds. */
export function ChatPanel({ partner, backHref, badge, alwaysShowBack, emptyTitle, emptyBody }: Props) {
  const { setChatOpen, markRead } = useConversation();

  useEffect(() => {
    setChatOpen(true);
    markRead();
    return () => setChatOpen(false);
  }, [setChatOpen, markRead]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ChatHeader partner={partner} backHref={backHref} badge={badge} alwaysShowBack={alwaysShowBack} />
      <MessageList partnerName={partner.display_name} emptyTitle={emptyTitle} emptyBody={emptyBody} />
      <Composer partnerName={partner.display_name} />
    </div>
  );
}
