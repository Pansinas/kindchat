import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts.slice(0, 1);
  return letters.map((p) => [...p][0]?.toUpperCase() ?? "").join("") || "?";
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const dateFmt = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" });

export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export function formatDayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return dayFmt.format(d);
}

export function formatLastSeen(iso: string, now = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "last seen just now";
  if (minutes < 60) return `last seen ${minutes} min ago`;
  const label = formatDayLabel(iso, now);
  if (label === "Today") return `last seen today at ${formatTime(iso)}`;
  if (label === "Yesterday") return `last seen yesterday at ${formatTime(iso)}`;
  return `last seen ${dateFmt.format(new Date(iso))}`;
}
