"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";
import { friendlyError } from "@/lib/domain/errors";

export function ForgotPasswordForm() {
  const [state, setState] = useState<"idle" | "pending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const username = String(new FormData(event.currentTarget).get("username") ?? "").trim();
    if (!username) {
      setError("Enter your username.");
      return;
    }
    setError(null);
    setState("pending");
    try {
      await api("/auth/password/forgot", { body: { username } });
      setState("sent");
    } catch (err) {
      setError(friendlyError(err));
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <Alert variant="success">
        If this account has a verified recovery email, we&apos;ve sent it a link to reset your password. The link is valid
        for one hour.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <FormField id="username" label="Username">
        <Input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
      </FormField>
      <Button type="submit" size="lg" disabled={state === "pending"}>
        {state === "pending" ? <Spinner /> : null}
        Send reset link
      </Button>
    </form>
  );
}
