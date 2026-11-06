import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Alert({ className, variant = "default", ...props }: ComponentProps<"div"> & { variant?: "default" | "destructive" | "success" }) {
  return (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm leading-relaxed",
        variant === "default" && "border-border bg-muted/60 text-foreground",
        variant === "destructive" && "border-destructive/30 bg-destructive/8 text-destructive",
        variant === "success" && "border-success/30 bg-success/10 text-success",
        className,
      )}
      {...props}
    />
  );
}
