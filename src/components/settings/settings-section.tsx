import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SettingsSection({ id, title, description, children, tone }: { id: string; title: string; description?: string; children: ReactNode; tone?: "danger" }) {
  return (
    <Card id={id} className={cn("scroll-mt-6", tone === "danger" && "border-destructive/30")}>
      <CardHeader>
        <CardTitle className={tone === "danger" ? "text-destructive" : undefined}>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[15px] font-medium">{title}</p>
        {description ? <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
