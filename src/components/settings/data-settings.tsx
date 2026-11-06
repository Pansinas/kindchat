"use client";

import { Download, HeartCrack, LogOut, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { useAppState } from "@/components/providers/app-state-provider";
import { ConfirmDialog, type ConfirmValues } from "@/components/settings/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApiError, api } from "@/lib/api-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

async function downloadExport(password: string) {
  const res = await fetch("/api/v1/account/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    throw new ApiError(data?.error?.code ?? "UNKNOWN", res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pairvella-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportData() {
  const { state } = useAppState();
  return (
    <div className="grid gap-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Download your profile, settings and conversation as a JSON file.
        {state.ended_couple && !state.couple
          ? ` Your previous conversation is included until ${formatDate(state.ended_couple.purge_after)}.`
          : ""}
      </p>
      <ConfirmDialog
        trigger={
          <Button variant="outline" className="justify-self-start">
            <Download /> Export my data
          </Button>
        }
        title="Export your data"
        description="For your security, confirm your password. The file contains your private messages — store it somewhere safe."
        confirmLabel="Download"
        variant="default"
        requirePassword
        onConfirm={async ({ password }) => {
          await downloadExport(password);
          toast.success("Your export has downloaded.");
        }}
      />
    </div>
  );
}

export function DisconnectPartner() {
  const { state, refresh } = useAppState();
  const [alsoBlock, setAlsoBlock] = useState(false);
  const couple = state.couple;
  if (!couple) {
    return <p className="text-sm text-muted-foreground">You&apos;re not connected with anyone right now.</p>;
  }
  const partner = couple.partner;

  async function disconnect({ typed }: ConfirmValues) {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.rpc("disconnect_partner", { p_confirm_username: typed });
    if (error) throw error;
    if (alsoBlock) await supabase.rpc("block_user", { p_user: partner.id });
    await refresh();
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Ending your space removes access to the conversation for both of you. Either of you can download it for 30 days, then it is
        permanently deleted.
      </p>
      <ConfirmDialog
        trigger={
          <Button variant="outline" className="justify-self-start">
            <HeartCrack /> Disconnect from {partner.display_name}
          </Button>
        }
        title={`Disconnect from ${partner.display_name}?`}
        description={
          <div className="grid gap-2">
            <p>This happens immediately and can&apos;t be undone:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>Neither of you will be able to open or send messages in this space.</li>
              <li>Each of you can export the conversation from Settings for 30 days.</li>
              <li>After 30 days the conversation is permanently deleted.</li>
            </ul>
            <p>Consider exporting your data first.</p>
          </div>
        }
        confirmLabel="Disconnect"
        typeToConfirm={partner.username}
        onConfirm={disconnect}
      >
        <label className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 text-sm">
          <span>Also block @{partner.username}</span>
          <Switch checked={alsoBlock} onCheckedChange={setAlsoBlock} aria-label={`Also block ${partner.username}`} />
        </label>
      </ConfirmDialog>
    </div>
  );
}

export function DeleteAccount() {
  const router = useRouter();
  const { state } = useAppState();
  return (
    <div className="grid gap-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Permanently delete your account, profile and sign-in details. If you&apos;re connected, your space ends and your partner keeps
        a 30-day window to export the conversation.
      </p>
      <ConfirmDialog
        trigger={
          <Button variant="destructive" className="justify-self-start">
            <Trash2 /> Delete my account
          </Button>
        }
        title="Delete your account permanently?"
        description="This cannot be undone. You will be signed out everywhere."
        confirmLabel="Delete account"
        typeToConfirm={state.profile.username}
        requirePassword
        onConfirm={async ({ password, typed }) => {
          await api("/account/delete", { body: { password, confirmUsername: typed } });
          await getSupabaseBrowserClient().auth.signOut({ scope: "local" }).catch(() => undefined);
          router.replace("/");
          router.refresh();
        }}
      />
    </div>
  );
}

export function SessionControls() {
  return (
    <div className="flex flex-wrap gap-2">
      <SignOutButton variant="outline">
        <LogOut /> Sign out
      </SignOutButton>
      <SignOutButton variant="ghost" everywhere>
        Sign out of all devices
      </SignOutButton>
    </div>
  );
}
