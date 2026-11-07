"use client";

import { useEffect, useRef } from "react";
import { useConversation } from "@/components/providers/conversation-provider";

/** Calls `onRead` when the open conversation's unread count drops to zero (to refresh badges). */
export function SyncUnread({ onRead }: { onRead: () => void }) {
  const { unread, status } = useConversation();
  const previous = useRef(unread);
  useEffect(() => {
    if (status === "ready" && previous.current > 0 && unread === 0) onRead();
    previous.current = unread;
  }, [unread, status, onRead]);
  return null;
}
