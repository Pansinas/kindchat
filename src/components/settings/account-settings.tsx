"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/auth/password-input";
import { useAppState } from "@/components/providers/app-state-provider";
import { ConfirmDialog, type ConfirmValues } from "@/components/settings/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";
import { friendlyError } from "@/lib/domain/errors";
import { passwordSchema, usernameSchema } from "@/lib/domain/validation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function UsernameForm() {
  const { state, refresh } = useAppState();
  const [value, setValue] = useState(state.profile.username);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = usernameSchema.safeParse(value);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid username.");
    setError(null);
    setPending(true);
    const { error: rpcError } = await getSupabaseBrowserClient().rpc("change_username", { p_username: parsed.data });
    setPending(false);
    if (rpcError) return setError(friendlyError(rpcError));
    toast.success("Username updated. Use it the next time you sign in.");
    await refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <FormField id="new-username" label="Username" error={error ?? undefined} hint="You sign in with this. You can change it up to 3 times a month.">
        <div className="flex gap-2">
          <Input id="new-username" value={value} onChange={(e) => setValue(e.target.value)} autoCapitalize="none" spellCheck={false} maxLength={20} aria-describedby="new-username-desc" />
          <Button type="submit" variant="secondary" disabled={pending || value === state.profile.username}>
            {pending ? <Spinner /> : null} Save
          </Button>
        </div>
      </FormField>
    </form>
  );
}

function PasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const parsed = passwordSchema.safeParse(newPassword);
    if (!currentPassword) return setError("Enter your current password.");
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid password.");
    if (newPassword !== form.get("confirmNewPassword")) return setError("New passwords do not match.");
    setError(null);
    setPending(true);
    try {
      await api("/account/password", { body: { currentPassword, newPassword } });
      toast.success("Password changed. Other devices have been signed out.");
      formEl.reset();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <h3 className="font-medium">Change password</h3>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <FormField id="currentPassword" label="Current password">
        <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="newPassword" label="New password">
          <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" />
        </FormField>
        <FormField id="confirmNewPassword" label="Confirm new password">
          <PasswordInput id="confirmNewPassword" name="confirmNewPassword" autoComplete="new-password" />
        </FormField>
      </div>
      <Button type="submit" variant="secondary" disabled={pending} className="justify-self-start">
        {pending ? <Spinner /> : null} Update password
      </Button>
    </form>
  );
}

function RecoveryEmailForm() {
  const [status, setStatus] = useState<{ recoveryEmail: string | null; verified: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = () =>
    api<{ recoveryEmail: string | null; verified: boolean }>("/account/recovery-email")
      .then(setStatus)
      .catch(() => setStatus({ recoveryEmail: null, verified: false }));
  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api("/account/recovery-email", { body: { email: form.get("email"), password: form.get("password") } });
      toast.success("Check your inbox to confirm the new address.");
      setEditing(false);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  async function remove({ password }: ConfirmValues) {
    await api("/account/recovery-email", { method: "DELETE", body: { password } });
    toast("Recovery email removed.");
    await load();
  }

  return (
    <div className="grid gap-4">
      <div>
        <h3 className="font-medium">Recovery email</h3>
        <p className="mt-1 text-sm text-muted-foreground">Private. Only used to reset your password. Never shown to anyone.</p>
      </div>
      {status === null ? (
        <Spinner />
      ) : !editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[15px]">
            {status.recoveryEmail ? (
              <>
                {status.recoveryEmail}{" "}
                <span className={status.verified ? "text-success" : "text-muted-foreground"}>({status.verified ? "confirmed" : "waiting for confirmation"})</span>
              </>
            ) : (
              <span className="text-muted-foreground">None — you won&apos;t be able to reset a forgotten password.</span>
            )}
          </p>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {status.recoveryEmail ? "Change" : "Add"}
          </Button>
          {status.recoveryEmail ? (
            <ConfirmDialog
              trigger={<Button size="sm" variant="ghost">Remove</Button>}
              title="Remove recovery email?"
              description="Without a recovery email you won't be able to reset a forgotten password."
              confirmLabel="Remove"
              requirePassword
              onConfirm={remove}
            />
          ) : null}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="recovery-email" label="Email address">
              <Input id="recovery-email" name="email" type="email" autoComplete="email" required />
            </FormField>
            <FormField id="recovery-password" label="Current password">
              <PasswordInput id="recovery-password" name="password" autoComplete="current-password" required />
            </FormField>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? <Spinner /> : null} Send confirmation
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AccountSettings() {
  return (
    <div className="grid gap-6">
      <UsernameForm />
      <Separator />
      <PasswordForm />
      <Separator />
      <RecoveryEmailForm />
    </div>
  );
}
