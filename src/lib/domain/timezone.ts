/** Time-zone helpers (pure; no framework imports). */

export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** UTC offset in minutes of an IANA zone at a given instant (e.g. Asia/Kolkata → 330). */
export function offsetMinutes(timeZone: string, at: Date = new Date()): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(at);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    if (name === "GMT" || name === "UTC") return 0;
    const match = name.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
    return match[1] === "-" ? -minutes : minutes;
  } catch {
    return null;
  }
}

/**
 * True only when both zones are known and their clocks currently differ.
 * Zones with the same offset (e.g. Asia/Kolkata and Asia/Calcutta) count as the same time.
 */
export function clocksDiffer(mine: string | null | undefined, theirs: string | null | undefined, at: Date = new Date()): boolean {
  if (!mine || !theirs) return false;
  const a = offsetMinutes(mine, at);
  const b = offsetMinutes(theirs, at);
  return a !== null && b !== null && a !== b;
}

/** Their local time, e.g. "2:14 AM" (or "Tue 2:14 AM" when it's a different day for them). */
export function localTimeLabel(timeZone: string, mine: string | null | undefined, at: Date = new Date()): string {
  const time = new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit" }).format(at);
  if (!mine) return time;
  const day = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  if (day(timeZone) === day(mine)) return time;
  const weekday = new Intl.DateTimeFormat(undefined, { timeZone, weekday: "short" }).format(at);
  return `${weekday} ${time}`;
}
