"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import { avatarUrl } from "@/lib/env";
import { cn, initials } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  path?: string | null;
  className?: string;
  online?: boolean;
}

export function UserAvatar({ name, path, className, online }: UserAvatarProps) {
  const src = avatarUrl(path);
  return (
    <span className="relative inline-flex shrink-0">
      <AvatarPrimitive.Root className={cn("relative flex size-10 overflow-hidden rounded-full bg-accent", className)}>
        {src ? <AvatarPrimitive.Image src={src} alt="" className="aspect-square size-full object-cover" /> : null}
        <AvatarPrimitive.Fallback className="flex size-full items-center justify-center text-sm font-medium text-accent-foreground">
          {initials(name)}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
      {online ? (
        <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-card bg-success" aria-label="Online" />
      ) : null}
    </span>
  );
}
