import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <circle cx="12.5" cy="16" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9" />
      <circle cx="19.5" cy="16" r="7.5" fill="none" stroke="var(--lavender)" strokeWidth="2" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-full text-foreground", className)} aria-label="Pairvella home">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[0.18em]">PAIRVELLA</span>
    </Link>
  );
}
