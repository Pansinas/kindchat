"use client";

import { ArrowUp, Reply, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { EmojiPicker } from "@/components/chat/emoji-picker";
import { useConversation } from "@/components/providers/conversation-provider";
import { Button } from "@/components/ui/button";
import { MESSAGE_MAX_LENGTH, codePointLength, replySnippet, validateBody } from "@/lib/domain/messages";
import { cn } from "@/lib/utils";

export function Composer({ partnerName }: { partnerName: string }) {
  const { send, notifyTyping, stopTyping, replyingTo, setReplyingTo, userId } = useConversation();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const length = codePointLength(text);
  const valid = validateBody(text).ok;
  const nearLimit = length > MESSAGE_MAX_LENGTH - 500;

  // Focus the box when a reply is started.
  useEffect(() => {
    if (replyingTo) ref.current?.focus();
  }, [replyingTo]);

  function resize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function submit() {
    if (!valid) return;
    const value = text;
    setText("");
    requestAnimationFrame(resize);
    void send(value);
    ref.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && replyingTo) {
      e.preventDefault();
      setReplyingTo(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function insert(emoji: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
      resize();
    });
  }

  return (
    <div className="border-t border-border bg-card/80 px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-5">
      {replyingTo ? (
        <div className="mb-2 flex items-center gap-2.5 rounded-xl border-l-[3px] border-lavender bg-accent/60 py-1.5 pr-1.5 pl-3" role="status">
          <Reply className="size-4 shrink-0 text-accent-foreground" aria-hidden />
          <div className="min-w-0 flex-1 text-[13px] leading-snug">
            <p className="font-semibold text-accent-foreground">
              Replying to {replyingTo.sender_id === userId ? "yourself" : partnerName}
            </p>
            <p className="truncate text-muted-foreground">{replySnippet(replyingTo)}</p>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Cancel reply"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      <form
        className="flex items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <EmojiPicker onPick={insert} />
        <div className="relative flex-1">
          <label htmlFor="composer" className="sr-only">Message {partnerName}</label>
          <textarea
            id="composer"
            ref={ref}
            rows={1}
            value={text}
            placeholder={`Message ${partnerName}`}
            onChange={(e) => {
              setText(e.target.value);
              resize();
              if (e.target.value.trim()) notifyTyping();
              else stopTyping();
            }}
            onBlur={stopTyping}
            onKeyDown={onKeyDown}
            enterKeyHint="send"
            className="block max-h-40 min-h-11 w-full resize-none rounded-[1.4rem] border border-input bg-background px-4 py-2.5 text-[15px] leading-relaxed placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none"
            aria-describedby={nearLimit ? "composer-count" : undefined}
          />
        </div>
        <Button type="submit" size="icon" disabled={!valid} aria-label="Send message" className="mb-0.5 shrink-0">
          <ArrowUp className="size-5" />
        </Button>
      </form>
      {nearLimit ? (
        <p id="composer-count" className={cn("mt-1.5 text-right text-xs", length > MESSAGE_MAX_LENGTH ? "text-destructive" : "text-muted-foreground")}>
          {length.toLocaleString()} / {MESSAGE_MAX_LENGTH.toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}
