"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, safeNext } from "@/lib/api-client";
import { friendlyError } from "@/lib/domain/errors";
import { loginSchema } from "@/lib/domain/validation";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({ username: form.get("username"), password: form.get("password") });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please fill in both fields.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api("/auth/login", { body: parsed.data });
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <FormField id="username" label="Username">
        <Input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
      </FormField>
      <FormField id="password" label="Password">
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </FormField>
      <div className="-mt-2 text-right">
        <Link href="/forgot-password" className="text-[13px] text-muted-foreground hover:text-foreground">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner /> : null}
        Sign in
      </Button>
    </form>
  );
}
