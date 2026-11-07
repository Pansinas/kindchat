"use client";

import { Home, Inbox, LogOut, MessageCircle, Settings, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/layout/logo";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { useAppState } from "@/components/providers/app-state-provider";
import { useOptionalConversation } from "@/components/providers/conversation-provider";
import { UserAvatar } from "@/components/ui/avatar";
import { cn, formatDate } from "@/lib/utils";

function useNav() {
  const { state } = useAppState();
  const paired = Boolean(state.couple);
  const requests = state.incoming_requests.length;
  const items = [
    { href: "/dashboard", label: "Home", shortLabel: "Home", icon: Home, badge: 0 },
    paired
      ? { href: "/chat", label: "Chat", shortLabel: "Chat", icon: MessageCircle, badge: -1 }
      : { href: "/connect", label: "Connect", shortLabel: "Connect", icon: UserPlus, badge: requests },
  ];
  if (state.is_founder) {
    items.push({ href: "/inbox", label: "Inbox", shortLabel: "Inbox", icon: Inbox, badge: state.founder_inbox_unread });
  } else if (state.founder_chat) {
    items.push({ href: "/team", label: "KindChat team", shortLabel: "Team", icon: Sparkles, badge: state.founder_chat.unread });
  }
  items.push({ href: "/settings", label: "Settings", shortLabel: "Settings", icon: Settings, badge: 0 });
  return items;
}

/** Routes that render a full-height conversation layout. */
const FULL_HEIGHT = ["/chat", "/team", "/inbox"];
/** Routes where the mobile top bar and bottom navigation are hidden (immersive chat). */
const IMMERSIVE = ["/chat", "/team"];

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto min-w-5 rounded-full bg-lavender px-1.5 py-0.5 text-center text-[11px] leading-none font-semibold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state } = useAppState();
  const conversation = useOptionalConversation();
  const nav = useNav();
  const unread = conversation?.unread ?? 0;
  const isChat = IMMERSIVE.includes(pathname);
  const fullHeight = FULL_HEIGHT.includes(pathname);
  const partner = state.couple?.partner;

  return (
    <div className="flex h-dvh overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card/60 md:flex">
        <div className="px-5 pt-5 pb-6">
          <Logo href="/dashboard" />
        </div>
        {partner ? (
          <div className="mx-4 mb-5 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <UserAvatar
                name={partner.display_name}
                path={partner.avatar_path}
                className="size-11"
                online={conversation?.showPresence && conversation.partnerOnline}
              />
              <div className="min-w-0">
                <p className="truncate font-medium">{partner.display_name}</p>
                <p className="truncate text-[13px] text-muted-foreground">@{partner.username}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Together on KindChat since {formatDate(state.couple!.paired_since)}</p>
          </div>
        ) : null}
        <nav className="flex flex-col gap-1 px-3" aria-label="Main">
          {nav.map(({ href, label, icon: Icon, badge }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors",
                  active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-[18px]" />
                {label}
                <Badge count={badge === -1 ? unread : badge} />
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center gap-3 border-t border-border p-4">
          <UserAvatar name={state.profile.display_name} path={state.profile.avatar_path} className="size-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{state.profile.display_name}</p>
            <p className="truncate text-xs text-muted-foreground">@{state.profile.username}</p>
          </div>
          <SignOutButton size="icon-sm" aria-label="Sign out" title="Sign out">
            <LogOut />
          </SignOutButton>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar (hidden on the full-screen chat) */}
        {!isChat ? (
          <header className="flex items-center justify-between border-b border-border bg-card/70 px-4 py-3 backdrop-blur md:hidden">
            <Logo href="/dashboard" />
            <UserAvatar name={state.profile.display_name} path={state.profile.avatar_path} className="size-8" />
          </header>
        ) : null}

        <main id="main" className={cn("min-h-0 flex-1", fullHeight ? "flex flex-col" : "overflow-y-auto")}>
          {children}
        </main>

        {/* Mobile bottom navigation */}
        {!isChat ? (
          <nav
            className="grid border-t border-border bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
            style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
            aria-label="Main"
          >
            {nav.map(({ href, shortLabel: label, icon: Icon, badge }) => {
              const active = pathname === href;
              const count = badge === -1 ? unread : badge;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative flex flex-col items-center gap-1 py-2.5 text-[11px]", active ? "text-foreground" : "text-muted-foreground")}
                >
                  <Icon className="size-5" />
                  {label}
                  {count > 0 ? <span className="absolute top-1.5 left-1/2 ml-2 size-2 rounded-full bg-lavender" aria-label={`${count} unread`} /> : null}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
