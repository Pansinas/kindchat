"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useConversation } from "@/components/providers/conversation-provider";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatLastSeen } from "@/lib/utils";
import type { ProfileCard } from "@/types/app";

export function ChatHeader({ partner }: { partner: ProfileCard }) {
  const c = useConversation();
  const online = c.showPresence && c.partnerOnline;
  const status = c.partnerTyping
    ? "typing…"
    : online
      ? "online"
      : c.partnerLastSeen && c.lastSeenVisible
        ? formatLastSeen(c.partnerLastSeen)
        : null;

  return (
    <header className="flex items-center gap-3 border-b border-border bg-card/80 px-3 py-2.5 backdrop-blur sm:px-5 sm:py-3">
      <Button asChild variant="ghost" size="icon-sm" className="md:hidden">
        <Link href="/dashboard" aria-label="Back to home">
          <ArrowLeft />
        </Link>
      </Button>
      <UserAvatar name={partner.display_name} path={partner.avatar_path} online={online} className="size-10" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] leading-tight font-semibold">{partner.display_name}</h1>
        <p className="truncate text-[13px] text-muted-foreground" aria-live="polite">
          {status ? (
            <span className={c.partnerTyping ? "text-accent-foreground" : online ? "text-success" : undefined}>{status}</span>
          ) : (
            <>@{partner.username}</>
          )}
        </p>
      </div>
      {c.connection === "offline" ? (
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground" role="status">
          Reconnecting…
        </span>
      ) : null}
    </header>
  );
}
