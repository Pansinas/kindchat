"use client";

import { Smile } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const EMOJI = [
  "😊", "😂", "🥰", "😍", "😘", "🤗", "😴", "🥺",
  "😅", "😉", "🙃", "😢", "😮", "🤔", "😌", "😎",
  "❤️", "🤍", "💜", "✨", "🌙", "☀️", "🌧️", "🌸",
  "👍", "👏", "🙏", "🤞", "🎉", "☕", "🍕", "🏠",
];

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button type="button" variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label="Insert emoji" aria-expanded={open}>
        <Smile className="size-5" />
      </Button>
      {open ? (
        <div role="dialog" aria-label="Emoji" className="absolute bottom-12 left-0 z-20 grid w-[17rem] grid-cols-8 gap-0.5 rounded-2xl border border-border bg-popover p-2 shadow-xl">
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="flex size-8 items-center justify-center rounded-lg text-xl hover:bg-muted"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
