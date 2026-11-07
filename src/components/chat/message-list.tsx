"use client";

import { ArrowDown, MessageCircleHeart } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageBubble, type QuotePreview } from "@/components/chat/message-bubble";
import { useConversation } from "@/components/providers/conversation-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { deliveryStatus, isSameDay, replySnippet, type Message } from "@/lib/domain/messages";
import { formatDayLabel } from "@/lib/utils";

const GROUP_WINDOW_MS = 5 * 60_000;
const BOTTOM_THRESHOLD = 96;

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="my-5 flex justify-center" role="separator">
      <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">{formatDayLabel(iso)}</span>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-5" aria-label="Loading messages">
      {[60, 40, 72, 52, 35, 64].map((w, i) => (
        <Skeleton key={i} className={i % 2 ? "h-10 self-end rounded-2xl" : "h-10 self-start rounded-2xl"} style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export function MessageList({ partnerName, emptyTitle, emptyBody }: { partnerName: string; emptyTitle?: string; emptyBody?: string }) {
  const c = useConversation();
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Quote block for a reply: who wrote the original and a one-line preview.
  const quoteFor = (replyToId: string | null | undefined): QuotePreview | null => {
    if (!replyToId) return null;
    const original = c.findMessage(replyToId);
    return {
      author: !original ? "Message" : original.sender_id === c.userId ? "You" : partnerName,
      text: replySnippet(original),
      onClick: () => void jumpTo(replyToId),
    };
  };

  // Scroll to (and briefly highlight) the original message, loading older pages if needed.
  const jumpTo = async (id: string) => {
    for (let i = 0; i < 20; i++) {
      const el = document.getElementById(`msg-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightId(id);
        window.setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 1600);
        return;
      }
      if (!c.hasMoreOlder) return;
      await c.loadOlder();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  };

  const reply = (m: Message) => c.setReplyingTo(m);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const [firstUnreadSeq, setFirstUnreadSeq] = useState<number | null | undefined>(undefined);
  const prevFirstSeq = useRef<number | null>(null);
  const prevHeight = useRef(0);
  const initialScrollDone = useRef(false);

  const myCursor = c.cursors[c.userId];
  const partnerCursor = c.cursors[c.partnerId] ?? null;

  // Remember where unread messages started when the chat was opened.
  if (c.status === "ready" && firstUnreadSeq === undefined) {
    const lastRead = myCursor?.last_read_seq ?? 0;
    setFirstUnreadSeq(c.messages.find((m) => m.sender_id === c.partnerId && m.seq > lastRead)?.seq ?? null);
  }

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
    if (bottom) c.markRead();
  }, [c]);

  // Keep scroll position stable when older pages are prepended; follow new messages at the bottom.
  const firstSeq = c.messages[0]?.seq ?? null;
  const lastKey = `${c.messages[c.messages.length - 1]?.id ?? ""}:${c.pending.length}`;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || c.status !== "ready") return;
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      const divider = el.querySelector<HTMLElement>("[data-unread-divider]");
      if (divider) el.scrollTop = Math.max(0, divider.offsetTop - 80);
      else scrollToBottom();
    } else if (prevFirstSeq.current !== null && firstSeq !== null && firstSeq < prevFirstSeq.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (atBottomRef.current) {
      scrollToBottom();
    }
    prevFirstSeq.current = firstSeq;
    prevHeight.current = el.scrollHeight;
  }, [c.status, firstSeq, lastKey, scrollToBottom]);

  // Our own new messages always scroll into view.
  const pendingCount = c.pending.length;
  useEffect(() => {
    if (pendingCount > 0) scrollToBottom("smooth");
  }, [pendingCount, scrollToBottom]);

  // Infinite scroll upwards.
  const { hasMoreOlder, loadOlder } = c;
  useEffect(() => {
    const el = topRef.current;
    const root = scrollRef.current;
    if (!el || !root || !hasMoreOlder) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && initialScrollDone.current) void loadOlder();
      },
      { root, rootMargin: "200px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreOlder, loadOlder]);

  // Mark as read when the newest messages are visible and the window is focused.
  const { markRead, messages } = c;
  useEffect(() => {
    if (atBottomRef.current) markRead();
  }, [messages, markRead]);
  useEffect(() => {
    const onFocus = () => atBottomRef.current && markRead();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [markRead]);

  if (c.status === "loading") return <div className="flex-1 overflow-hidden"><ListSkeleton /></div>;
  if (c.status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
        We couldn&apos;t load your conversation. Check your connection and refresh.
      </div>
    );
  }

  const empty = c.messages.length === 0 && c.pending.length === 0;
  const newBelow = !atBottom && c.unread > 0;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain px-3 pb-4 sm:px-6"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Conversation with ${partnerName}`}
      >
        <div className="mx-auto flex max-w-3xl flex-col">
          <div ref={topRef} className="h-1" />
          {c.loadingOlder ? (
            <div className="flex justify-center py-3 text-muted-foreground"><Spinner /></div>
          ) : !c.hasMoreOlder && !empty ? (
            <p className="py-6 text-center text-xs text-muted-foreground">This is the beginning of your conversation.</p>
          ) : null}

          {empty ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <MessageCircleHeart className="size-7" />
              </span>
              <p className="text-lg font-medium">{emptyTitle ?? "Your space is ready"}</p>
              <p className="max-w-xs text-sm text-muted-foreground">{emptyBody ?? `Say hello to ${partnerName}. Only the two of you can see this conversation.`}</p>
            </div>
          ) : null}

          {c.messages.map((m, i) => {
            const prev = c.messages[i - 1];
            const newDay = !prev || !isSameDay(prev.created_at, m.created_at);
            const grouped =
              !newDay && prev?.sender_id === m.sender_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_WINDOW_MS;
            const mine = m.sender_id === c.userId;
            return (
              <Fragment key={m.id}>
                {newDay ? <DaySeparator iso={m.created_at} /> : null}
                {firstUnreadSeq === m.seq ? (
                  <div data-unread-divider className="my-4 flex items-center gap-3 text-[11px] font-medium tracking-wide text-accent-foreground uppercase">
                    <span className="h-px flex-1 bg-lavender/40" /> New messages <span className="h-px flex-1 bg-lavender/40" />
                  </div>
                ) : null}
                <MessageBubble
                  messageId={m.id}
                  body={m.body}
                  createdAt={m.created_at}
                  mine={mine}
                  deleted={Boolean(m.deleted_at)}
                  status={mine ? deliveryStatus(m, partnerCursor) : undefined}
                  groupedWithPrevious={grouped && firstUnreadSeq !== m.seq && !m.reply_to_id}
                  quote={quoteFor(m.reply_to_id)}
                  highlighted={highlightId === m.id}
                  onReply={() => reply(m)}
                />
              </Fragment>
            );
          })}

          {c.pending.map((p) => (
            <MessageBubble
              key={p.client_message_id}
              body={p.body}
              createdAt={p.created_at}
              mine
              status={p.status}
              groupedWithPrevious={false}
              quote={quoteFor(p.reply_to_id)}
              onRetry={() => void c.retry(p.client_message_id)}
              onDiscard={() => c.discard(p.client_message_id)}
            />
          ))}

          {c.partnerTyping ? (
            <div className="mt-3 flex items-center gap-1 self-start rounded-[1.15rem] rounded-bl-md border border-border bg-bubble-theirs px-4 py-3" aria-label={`${partnerName} is typing`}>
              {[0, 150, 300].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {!atBottom ? (
        <Button
          size="sm"
          variant="outline"
          className="absolute right-4 bottom-4 shadow-md"
          onClick={() => scrollToBottom("smooth")}
          aria-label="Jump to latest messages"
        >
          <ArrowDown />
          {newBelow ? `${c.unread} new` : "Latest"}
        </Button>
      ) : null}
    </div>
  );
}
