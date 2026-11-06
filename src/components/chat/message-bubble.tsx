"use client";

import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import { memo } from "react";
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
      return <CheckCheck className={cn(cls, "text-lavender")} />;
  }
}

interface Props {
  body: string | null;
  createdAt: string;
  mine: boolean;
  status?: DeliveryStatus;
  groupedWithPrevious: boolean;
  deleted?: boolean;
  onRetry?: () => void;
  onDiscard?: () => void;
}

export const MessageBubble = memo(function MessageBubble({ body, createdAt, mine, status, groupedWithPrevious, deleted, onRetry, onDiscard }: Props) {
  return (
    <div className={cn("flex w-full", mine ? "justify-end" : "justify-start", groupedWithPrevious ? "mt-0.5" : "mt-3")}>
      <div className={cn("flex max-w-[85%] flex-col sm:max-w-[70%]", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-[1.15rem] px-3.5 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]",
            mine
              ? "bg-bubble-mine text-bubble-mine-foreground"
              : "border border-border bg-bubble-theirs text-bubble-theirs-foreground",
            !groupedWithPrevious && (mine ? "rounded-br-md" : "rounded-bl-md"),
            status === "sending" && "opacity-70",
            deleted && "italic opacity-70",
          )}
        >
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
    </div>
  );
});
