"use client";

import { Check, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, safeNext } from "@/lib/api-client";
import { friendlyError } from "@/lib/domain/errors";
import { USERNAME_PATTERN, registerSchema } from "@/lib/domain/validation";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [remote, setRemote] = useState<{ username: string; available: boolean | null }>({ username: "", available: null });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const trimmed = username.trim();
  const locallyValid = USERNAME_PATTERN.test(trimmed);
  const availability: Availability = !trimmed
    ? "idle"
    : !locallyValid
      ? "invalid"
      : remote.username !== trimmed
        ? "checking"
        : remote.available === null
          ? "idle"
          : remote.available
            ? "available"
            : "taken";

  useEffect(() => {
    if (!locallyValid) return;
    const value = trimmed;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/auth/username-available?username=${encodeURIComponent(value)}`, { signal: controller.signal });
        const data = (await res.json()) as { available?: boolean };
        setRemote({ username: value, available: Boolean(data.available) });
      } catch {
        if (!controller.signal.aborted) setRemote({ username: value, available: null });
      }
    }, 400);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed, locallyValid]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = registerSchema.safeParse({
      username: form.get("username"),
      displayName: form.get("displayName"),
      password: form.get("password"),
      confirmPassword: form.get("confirmPassword"),
      recoveryEmail: form.get("recoveryEmail") ?? "",
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        errs[key] ??= issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setError(null);
    setPending(true);
    try {
      await api("/auth/register", { body: parsed.data });
      const next = params.get("next");
      router.replace(next ? safeNext(next) : "/onboarding");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
      setPending(false);
    }
  }

  const usernameHint =
    availability === "checking" ? (
      <span className="inline-flex items-center gap-1.5"><Spinner className="size-3" /> Checking…</span>
    ) : availability === "available" ? (
      <span className="inline-flex items-center gap-1 text-success"><Check className="size-3.5" /> Available</span>
    ) : availability === "taken" ? (
      <span className="inline-flex items-center gap-1 text-destructive"><X className="size-3.5" /> That username isn&apos;t available</span>
    ) : (
      "3–20 characters: letters, numbers and underscores."
    );

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <FormField id="username" label="Username" error={fieldErrors.username} hint={usernameHint}>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={Boolean(fieldErrors.username) || availability === "taken"}
          aria-describedby="username-desc"
          required
          autoFocus
        />
      </FormField>
      <FormField id="displayName" label="Display name" error={fieldErrors.displayName} hint="How your partner will see you.">
        <Input id="displayName" name="displayName" autoComplete="nickname" maxLength={50} aria-invalid={Boolean(fieldErrors.displayName)} aria-describedby="displayName-desc" required />
      </FormField>
      <FormField id="password" label="Password" error={fieldErrors.password} hint="At least 10 characters.">
        <PasswordInput id="password" name="password" autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} aria-describedby="password-desc" required />
      </FormField>
      <FormField id="confirmPassword" label="Confirm password" error={fieldErrors.confirmPassword}>
        <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby="confirmPassword-desc" required />
      </FormField>
      <FormField
        id="recoveryEmail"
        label="Recovery email (optional)"
        error={fieldErrors.recoveryEmail}
        hint="Private. Used only to reset your password. Without it, a forgotten password can't be recovered."
      >
        <Input id="recoveryEmail" name="recoveryEmail" type="email" autoComplete="email" aria-describedby="recoveryEmail-desc" />
      </FormField>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner /> : null}
        Create account
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        By creating an account you agree to the <a className="underline underline-offset-2" href="/terms">Terms</a> and{" "}
        <a className="underline underline-offset-2" href="/privacy">Privacy policy</a>.
      </p>
    </form>
  );
}
