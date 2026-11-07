"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PartnerLocalTime } from "@/components/chat/partner-local-time";
import { useAppState } from "@/components/providers/app-state-provider";
import { useConversation } from "@/components/providers/conversation-provider";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatLastSeen } from "@/lib/utils";
import type { ProfileCard } from "@/types/app";

interface Props {
  partner: ProfileCard;
  backHref: string;
  /** Optional label next to the name, e.g. "Founder". */
  badge?: string;
  /** Show the back button on desktop too (e.g. founder inbox). */
  alwaysShowBack?: boolean;
}

export function ChatHeader({ partner, backHref, badge, alwaysShowBack }: Props) {
  const c = useConversation();
  const { state } = useAppState();
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
      <Button asChild variant="ghost" size="icon-sm" className={alwaysShowBack ? undefined : "md:hidden"}>
        <Link href={backHref} aria-label="Back">
          <ArrowLeft />
        </Link>
      </Button>
      <UserAvatar name={partner.display_name} path={partner.avatar_path} online={online} className="size-10" />
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 truncate text-[15px] leading-tight font-semibold">
          <span className="truncate">{partner.display_name}</span>
          {badge ? (
            <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">{badge}</span>
          ) : null}
        </h1>
        <p className="flex min-w-0 items-center gap-2 truncate text-[13px] text-muted-foreground" aria-live="polite">
          {status ? (
            <span className={c.partnerTyping ? "text-accent-foreground" : online ? "text-success" : undefined}>{status}</span>
          ) : (
            <span className="truncate">@{partner.username}</span>
          )}
          <PartnerLocalTime
            className="sm:hidden"
            partnerName={partner.display_name}
            partnerTimezone={c.partnerTimezone}
            myTimezone={state.settings.timezone}
          />
        </p>
      </div>
      <PartnerLocalTime
        className="hidden text-[13px] sm:inline-flex"
        partnerName={partner.display_name}
        partnerTimezone={c.partnerTimezone}
        myTimezone={state.settings.timezone}
      />
      {c.connection === "offline" ? (
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground" role="status">
          Reconnecting…
        </span>
      ) : null}
    </header>
  );
}
