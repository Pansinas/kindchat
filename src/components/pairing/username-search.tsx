"use client";

import { Search, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAppState } from "@/components/providers/app-state-provider";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { friendlyError } from "@/lib/domain/errors";
import { USERNAME_PATTERN } from "@/lib/domain/validation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SearchResult } from "@/types/app";

export function UsernameSearch() {
  const supabase = getSupabaseBrowserClient();
  const { refresh } = useAppState();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim().replace(/^@/, "");
    if (!USERNAME_PATTERN.test(q)) {
      setError("Usernames are 3–20 letters, numbers or underscores.");
      setResult(undefined);
      return;
    }
    setError(null);
    setSearching(true);
    const { data, error: rpcError } = await supabase.rpc("search_user_by_username", { p_username: q });
    setSearching(false);
    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }
    setResult(((data as SearchResult[]) ?? [])[0] ?? null);
  }

  async function sendRequest(target: SearchResult) {
    setSending(true);
    const { error: rpcError } = await supabase.rpc("send_connection_request", { p_recipient: target.id });
    setSending(false);
    if (rpcError) {
      toast.error(friendlyError(rpcError));
      return;
    }
    toast.success(`Request sent to ${target.display_name}.`);
    setResult({ ...target, relation: "outgoing_pending" });
    await refresh();
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={onSearch} className="flex gap-2" role="search">
        <label htmlFor="partner-search" className="sr-only">Partner&apos;s username</label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="partner-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Their exact username"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            className="pl-10"
            maxLength={21}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={searching}>
          {searching ? <Spinner /> : null}
          Search
        </Button>
      </form>
      {error ? <p className="text-[13px] text-destructive">{error}</p> : null}
      <div aria-live="polite">
        {result === null ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
            No one found with that username. Check the spelling, or send an invitation link instead.
          </p>
        ) : result ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3">
            <UserAvatar name={result.display_name} path={result.avatar_path} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{result.display_name}</p>
              <p className="truncate text-[13px] text-muted-foreground">@{result.username}</p>
            </div>
            {result.relation === "outgoing_pending" ? (
              <span className="text-[13px] text-muted-foreground">Request sent</span>
            ) : result.relation === "incoming_pending" ? (
              <span className="text-[13px] text-accent-foreground">Sent you a request — see above</span>
            ) : (
              <Button size="sm" onClick={() => sendRequest(result)} disabled={sending}>
                {sending ? <Spinner /> : <Send />}
                Send request
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
