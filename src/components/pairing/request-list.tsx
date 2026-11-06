"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAppState } from "@/components/providers/app-state-provider";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { friendlyError } from "@/lib/domain/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ConnectionRequestItem } from "@/types/app";

export function RequestList({ kind, items }: { kind: "incoming" | "outgoing"; items: ConnectionRequestItem[] }) {
  const { refresh } = useAppState();
  const [busy, setBusy] = useState<string | null>(null);
  const supabase = getSupabaseBrowserClient();

  async function run(id: string, action: "accept" | "decline" | "cancel") {
    setBusy(`${id}:${action}`);
    const { error } =
      action === "cancel"
        ? await supabase.rpc("cancel_connection_request", { p_request_id: id })
        : await supabase.rpc("respond_connection_request", { p_request_id: id, p_accept: action === "accept" });
    setBusy(null);
    if (error) {
      toast.error(friendlyError(error));
    } else if (action === "decline") {
      toast("Request declined.");
    } else if (action === "cancel") {
      toast("Request cancelled.");
    }
    await refresh();
  }

  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3">
          <UserAvatar name={item.user.display_name} path={item.user.avatar_path} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{item.user.display_name}</p>
            <p className="truncate text-[13px] text-muted-foreground">@{item.user.username}</p>
          </div>
          {kind === "incoming" ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run(item.id, "decline")} aria-label={`Decline request from ${item.user.display_name}`}>
                {busy === `${item.id}:decline` ? <Spinner /> : <X />}
                <span className="hidden sm:inline">Decline</span>
              </Button>
              <Button size="sm" disabled={Boolean(busy)} onClick={() => run(item.id, "accept")} aria-label={`Accept request from ${item.user.display_name}`}>
                {busy === `${item.id}:accept` ? <Spinner /> : <Check />}
                Accept
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => run(item.id, "cancel")}>
              {busy ? <Spinner /> : null}
              Cancel
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
