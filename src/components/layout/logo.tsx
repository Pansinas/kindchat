import Link from "next/link";
import { cn } from "@/lib/utils";

/** The KindChat app mark: two interlocking rings on a rounded charcoal tile (same artwork as the app icon). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="512" height="512" rx="116" fill="#2b2a33" />
      <circle cx="302" cy="256" r="98" fill="none" stroke="#a99dd6" strokeWidth="30" />
      <circle cx="210" cy="256" r="98" fill="none" stroke="#f7f4ee" strokeWidth="30" />
      <path d="M 285 352.5 A 98 98 0 0 1 226.9 319" fill="none" stroke="#a99dd6" strokeWidth="30" />
    </svg>
  );
}

export function Logo({ href = "/", className, size = "md" }: { href?: string; className?: string; size?: "md" | "lg" }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5 rounded-lg text-foreground", className)}
      aria-label="KindChat home"
    >
      <LogoMark className={size === "lg" ? "size-10" : "size-8"} />
      <span className={cn("leading-none font-semibold tracking-[-0.02em]", size === "lg" ? "text-[22px]" : "text-[19px]")}>
        Kind<span className="text-lavender">Chat</span>
      </span>
    </Link>
  );
}
