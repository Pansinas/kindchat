"use client";

import { Copy, Link2, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAppState } from "@/components/providers/app-state-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { friendlyError } from "@/lib/domain/errors";
import { publicEnv } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

/**
 * The raw invitation token is returned exactly once by create_invitation() and only its
 * hash is stored, so an existing link cannot be shown again — the user can create a new one
 * (which supersedes the old link) or revoke it.
 */
export function InvitePanel() {
  const supabase = getSupabaseBrowserClient();
  const { state, refresh } = useAppState();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "revoke" | null>(null);

  async function create() {
    setBusy("create");
    const { data, error } = await supabase.rpc("create_invitation");
    setBusy(null);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    const row = (data as Array<{ token: string }>)[0];
    const base = publicEnv.appUrl || window.location.origin;
    setLink(`${base}/invite/${row.token}`);
    await refresh();
  }

  async function revoke() {
    if (!state.invitation) return;
    setBusy("revoke");
    const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: state.invitation.id });
    setBusy(null);
    if (error) toast.error(friendlyError(error));
    else toast("Invitation link revoked.");
    setLink(null);
    await refresh();
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  }

  async function share() {
    if (!link) return;
    try {
      await navigator.share({ title: "Join me on Pairvella", text: "I made us a private space on Pairvella.", url: link });
    } catch {
      // Share sheet dismissed.
    }
  }

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="grid gap-4">
      {link ? (
        <>
          <div className="flex gap-2">
            <label htmlFor="invite-link" className="sr-only">Invitation link</label>
            <Input id="invite-link" value={link} readOnly onFocus={(e) => e.currentTarget.select()} className="font-mono text-[13px]" />
            <Button variant="secondary" onClick={copy} aria-label="Copy link">
              <Copy />
              <span className="hidden sm:inline">Copy</span>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {canShare ? (
              <Button variant="outline" size="sm" onClick={share}>
                <Share2 /> Share
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={revoke} disabled={busy !== null}>
              {busy === "revoke" ? <Spinner /> : <Trash2 />} Revoke link
            </Button>
          </div>
          <p className="text-[13px] text-muted-foreground">
            Works once and expires {state.invitation ? `on ${formatDate(state.invitation.expires_at)}` : "in 7 days"}. Only share it with your partner.
          </p>
        </>
      ) : state.invitation ? (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            You have an active invitation link (expires {formatDate(state.invitation.expires_at)}). For your security we only show a link
            once — create a new one if you need it again.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={create} disabled={busy !== null}>
              {busy === "create" ? <Spinner /> : <Link2 />} Create a new link
            </Button>
            <Button variant="ghost" onClick={revoke} disabled={busy !== null}>
              {busy === "revoke" ? <Spinner /> : <Trash2 />} Revoke
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={create} disabled={busy !== null} className="justify-self-start">
          {busy === "create" ? <Spinner /> : <Link2 />} Create invitation link
        </Button>
      )}
    </div>
  );
}
