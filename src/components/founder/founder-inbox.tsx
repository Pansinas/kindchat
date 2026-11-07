"use client";

import { Inbox, MessageSquarePlus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChatPanel } from "@/components/chat/chat-panel";
import { SyncUnread } from "@/components/founder/sync-unread";
import { useAppState } from "@/components/providers/app-state-provider";
import { ConversationProvider } from "@/components/providers/conversation-provider";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { friendlyError } from "@/lib/domain/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn, formatDayLabel, formatTime } from "@/lib/utils";
import type { FounderInboxItem } from "@/types/app";

function when(iso: string | null): string {
  if (!iso) return "";
  const label = formatDayLabel(iso);
  return label === "Today" ? formatTime(iso) : label === "Yesterday" ? "Yesterday" : new Date(iso).toLocaleDateString();
}

/** The founder's inbox: every user's KindChat team chat, plus starting a chat with anyone. */
export function FounderInbox() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("c");
  const { state, userId, refresh, founderActivity } = useAppState();
  const [items, setItems] = useState<FounderInboxItem[] | null>(null);
  const [filter, setFilter] = useState("");
  const [username, setUsername] = useState("");
  const [starting, setStarting] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  // (Re)load the inbox on mount, on new founder-chat activity and on demand.
  useEffect(() => {
    let active = true;
    supabase.rpc("founder_list_conversations").then(({ data, error }) => {
      if (!active) return;
      if (error) toast.error(friendlyError(error));
      else setItems((data as FounderInboxItem[]) ?? []);
    });
    return () => {
      active = false;
    };
  }, [supabase, founderActivity, reloadKey]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase().replace(/^@/, "");
    if (!items || !q) return items ?? [];
    return items.filter((i) => i.user.username.toLowerCase().includes(q) || i.user.display_name.toLowerCase().includes(q));
  }, [items, filter]);

  const selected = items?.find((i) => i.conversation_id === selectedId) ?? null;

  const onRead = useCallback(() => {
    load();
    void refresh();
  }, [load, refresh]);

  async function start(e: FormEvent) {
    e.preventDefault();
    const name = username.trim().replace(/^@/, "");
    if (!name) return;
    setStarting(true);
    const { data, error } = await supabase.rpc("founder_start_conversation", { p_username: name });
    setStarting(false);
    if (error) {
      toast.error(error.message === "USER_NOT_FOUND" ? "No user with that username." : friendlyError(error));
      return;
    }
    setUsername("");
    load();
    router.push(`/inbox?c=${data as string}`);
  }

  if (!state.is_founder) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">This page is only for the KindChat founder.</div>
    );
  }

  return (
    <div className="grid h-full min-h-0 flex-1 md:grid-cols-[340px_1fr]">
      <section className={cn("flex min-h-0 flex-col border-r border-border bg-card/40", selectedId && "hidden md:flex")} aria-label="Conversations">
        <div className="grid gap-3 border-b border-border p-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Inbox className="size-5" /> Inbox
          </h1>
          <form onSubmit={start} className="flex gap-2">
            <label htmlFor="start-username" className="sr-only">Start a chat by username</label>
            <Input id="start-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Start a chat with @username" autoCapitalize="none" spellCheck={false} className="h-9" />
            <Button type="submit" size="sm" disabled={starting} aria-label="Start chat">
              {starting ? <Spinner /> : <MessageSquarePlus />}
            </Button>
          </form>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="inbox-filter" className="sr-only">Filter conversations</label>
            <Input id="inbox-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" className="h-9 pl-9" />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {items === null ? (
            [0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-10 rounded-full" />
                <Skeleton className="h-9 flex-1" />
              </li>
            ))
          ) : visible.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">No conversations yet.</li>
          ) : (
            visible.map((item) => (
              <li key={item.conversation_id}>
                <Link
                  href={`/inbox?c=${item.conversation_id}`}
                  aria-current={item.conversation_id === selectedId ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted",
                    item.conversation_id === selectedId && "bg-accent hover:bg-accent",
                  )}
                >
                  <UserAvatar name={item.user.display_name} path={item.user.avatar_path} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn("truncate text-[15px]", item.unread > 0 && "font-semibold")}>{item.user.display_name}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{when(item.last_message_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] text-muted-foreground">
                        {item.last_message ? `${item.last_message.from_founder ? "You: " : ""}${item.last_message.body ?? ""}` : `@${item.user.username}`}
                      </p>
                      {item.unread > 0 ? (
                        <span className="min-w-5 rounded-full bg-lavender px-1.5 py-0.5 text-center text-[11px] leading-none font-semibold text-white">{item.unread}</span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className={cn("flex min-h-0 flex-col", !selectedId && "hidden md:flex")} aria-label="Conversation">
        {selected ? (
          <ConversationProvider
            key={selected.conversation_id}
            conversationId={selected.conversation_id}
            userId={userId}
            partnerId={selected.user.id}
            partnerName={selected.user.display_name}
            partnerTimezone={selected.user.timezone}
            settings={state.settings}
            kind="founder"
          >
            <SyncUnread onRead={onRead} />
            <ChatPanel
              partner={selected.user}
              backHref="/inbox"
              emptyTitle={`Say hello to ${selected.user.display_name}`}
              emptyBody="Only you and this user can see this conversation."
            />
          </ConversationProvider>
        ) : selectedId && items === null ? (
          <div className="flex flex-1 items-center justify-center"><Spinner /></div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <Inbox className="size-8" />
            <p>Select a conversation, or message any user by their username.</p>
          </div>
        )}
      </section>
    </div>
  );
}
