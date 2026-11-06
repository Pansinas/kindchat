"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";
import { friendlyError } from "@/lib/domain/errors";
import { passwordSchema } from "@/lib/domain/validation";

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [tokenHash] = useState(() => params.get("token_hash") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Remove the token from the address bar and history once read.
  useEffect(() => {
    if (tokenHash) window.history.replaceState(null, "", "/reset-password");
  }, [tokenHash]);

  if (!tokenHash) {
    return (
      <Alert variant="destructive">
        This reset link is invalid or incomplete. <Link className="underline" href="/forgot-password">Request a new one</Link>.
      </Alert>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirmPassword") ?? "");
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid password.");
    if (password !== confirm) return setError("Passwords do not match.");
    setError(null);
    setPending(true);
    try {
      await api("/auth/password/reset", { body: { tokenHash, password } });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <FormField id="password" label="New password" hint="At least 10 characters.">
        <PasswordInput id="password" name="password" autoComplete="new-password" aria-describedby="password-desc" required autoFocus />
      </FormField>
      <FormField id="confirmPassword" label="Confirm new password">
        <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required />
      </FormField>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner /> : null}
        Save new password
      </Button>
      <p className="text-center text-xs text-muted-foreground">All other devices will be signed out.</p>
    </form>
  );
}
