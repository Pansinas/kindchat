"use client";

import { AlertCircle, Check, CheckCheck, Clock, Reply } from "lucide-react";
import { memo, useRef, useState, type PointerEvent } from "react";
import type { DeliveryStatus } from "@/lib/domain/messages";
import { cn, formatTime } from "@/lib/utils";

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  sending: "Sending",
  failed: "Not sent",
  sent: "Sent",
  delivered: "Delivered",
  read: "Seen",
};

function StatusIcon({ status }: { status: DeliveryStatus }) {
  const cls = "size-3.5";
  switch (status) {
    case "sending":
      return <Clock className={cls} />;
    case "failed":
      return <AlertCircle className={cn(cls, "text-destructive")} />;
    case "sent":
      return <Check className={cls} />;
    case "delivered":
      return <CheckCheck className={cls} />;
    case "read":
      // Seen by the partner: green double tick.
      return <CheckCheck className={cn(cls, "text-read-tick")} strokeWidth={2.5} />;
  }
}

export interface QuotePreview {
  author: string;
  text: string;
  onClick?: () => void;
}

interface Props {
  messageId?: string;
  body: string | null;
  createdAt: string;
  mine: boolean;
  status?: DeliveryStatus;
  groupedWithPrevious: boolean;
  deleted?: boolean;
  quote?: QuotePreview | null;
  highlighted?: boolean;
  onReply?: () => void;
  onRetry?: () => void;
  onDiscard?: () => void;
}

const SWIPE_TRIGGER = 56;
const SWIPE_MAX = 80;

export const MessageBubble = memo(function MessageBubble({
  messageId,
  body,
  createdAt,
  mine,
  status,
  groupedWithPrevious,
  deleted,
  quote,
  highlighted,
  onReply,
  onRetry,
  onDiscard,
}: Props) {
  // Swipe right to reply (touch screens). Vertical scrolling is left to the browser.
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const horizontal = useRef(false);
  const [dx, setDx] = useState(0);
  const dxRef = useRef(0); // source of truth for the release handler (state can lag a frame)
  const canReply = Boolean(onReply) && !deleted;

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!canReply || e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    horizontal.current = false;
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const moveX = e.clientX - s.x;
    const moveY = e.clientY - s.y;
    if (!horizontal.current) {
      if (Math.abs(moveY) > 10 && Math.abs(moveY) > Math.abs(moveX)) {
        start.current = null; // vertical scroll: give up
        return;
      }
      if (moveX > 10) horizontal.current = true;
    }
    if (horizontal.current) {
      dxRef.current = Math.max(0, Math.min(SWIPE_MAX, moveX));
      setDx(dxRef.current);
    }
  }
  function endSwipe() {
    if (dxRef.current >= SWIPE_TRIGGER && onReply) {
      onReply();
      if ("vibrate" in navigator) navigator.vibrate?.(10);
    }
    start.current = null;
    horizontal.current = false;
    dxRef.current = 0;
    setDx(0);
  }

  return (
    <div
      id={messageId ? `msg-${messageId}` : undefined}
      className={cn("group relative flex w-full touch-pan-y", mine ? "justify-end" : "justify-start", groupedWithPrevious ? "mt-0.5" : "mt-3")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endSwipe}
      onPointerCancel={endSwipe}
    >
      {/* Swipe hint icon */}
      {dx > 0 ? (
        <span
          aria-hidden
          className="absolute top-1/2 left-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground"
          style={{ opacity: Math.min(1, dx / SWIPE_TRIGGER), transform: `translateY(-50%) scale(${0.6 + Math.min(0.4, dx / 140)})` }}
        >
          <Reply className="size-4" />
        </span>
      ) : null}

      <div
        className={cn("flex max-w-[85%] items-center gap-1.5 sm:max-w-[70%]", mine ? "flex-row-reverse" : "flex-row")}
        style={dx ? { transform: `translateX(${dx}px)` } : { transition: "transform 150ms ease-out" }}
      >
        <div className={cn("flex min-w-0 flex-col", mine ? "items-end" : "items-start")}>
          <div
            className={cn(
              "rounded-[1.15rem] px-3.5 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap transition-shadow [overflow-wrap:anywhere]",
              mine
                ? "bg-bubble-mine text-bubble-mine-foreground"
                : "border border-border bg-bubble-theirs text-bubble-theirs-foreground",
              !groupedWithPrevious && (mine ? "rounded-br-md" : "rounded-bl-md"),
              status === "sending" && "opacity-70",
              deleted && "italic opacity-70",
              highlighted && "ring-2 ring-lavender ring-offset-2 ring-offset-background",
            )}
          >
            {quote ? (
              <button
                type="button"
                onClick={quote.onClick}
                className={cn(
                  "mb-1.5 block w-full rounded-lg border-l-[3px] px-2.5 py-1.5 text-left text-[13px] leading-snug whitespace-normal not-italic",
                  mine ? "border-lavender bg-white/10" : "border-lavender bg-accent/60",
                )}
                aria-label={`Replying to ${quote.author}: ${quote.text}. Show original message`}
              >
                <span className={cn("block font-semibold", mine ? "text-[#d5cdf3]" : "text-accent-foreground")}>{quote.author}</span>
                <span className="line-clamp-2 opacity-80">{quote.text}</span>
              </button>
            ) : null}
            {deleted ? "Message deleted" : body}
          </div>
          <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <time dateTime={createdAt}>{formatTime(createdAt)}</time>
            {mine && status ? (
              <span className="inline-flex items-center gap-1" aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]}>
                <StatusIcon status={status} />
                {status === "failed" ? <span className="text-destructive">Not sent</span> : null}
              </span>
            ) : null}
            {status === "failed" ? (
              <>
                <button type="button" onClick={onRetry} className="font-medium text-foreground underline-offset-2 hover:underline">
                  Retry
                </button>
                <button type="button" onClick={onDiscard} className="hover:text-foreground">
                  Discard
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Reply button: appears on hover / keyboard focus (desktop). */}
        {canReply ? (
          <button
            type="button"
            onClick={onReply}
            className="mb-5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 [@media(hover:none)]:hidden"
            aria-label="Reply to this message"
            title="Reply"
          >
            <Reply className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
});
