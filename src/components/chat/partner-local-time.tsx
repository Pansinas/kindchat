"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { clocksDiffer, localTimeLabel } from "@/lib/domain/timezone";
import { cn } from "@/lib/utils";

interface Props {
  partnerName: string;
  partnerTimezone: string | null | undefined;
  myTimezone: string | null | undefined;
  className?: string;
}

/** "It's 2:14 AM for Alex" — rendered only when the two clocks actually differ. */
export function PartnerLocalTime({ partnerName, partnerTimezone, myTimezone, className }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const interval = window.setInterval(tick, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!now || !partnerTimezone || !clocksDiffer(myTimezone, partnerTimezone, now)) return null;
  const firstName = partnerName.split(" ")[0];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground", className)}>
      <Clock className="size-3.5" aria-hidden />
      <span>
        {localTimeLabel(partnerTimezone, myTimezone, now)} for {firstName}
      </span>
    </span>
  );
}
