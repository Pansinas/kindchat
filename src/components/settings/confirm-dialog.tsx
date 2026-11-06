"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert } from "@/components/ui/alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { friendlyError } from "@/lib/domain/errors";

export interface ConfirmValues {
  password: string;
  typed: string;
}

interface Props {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  variant?: ButtonProps["variant"];
  requirePassword?: boolean;
  /** When set, the user must type this text (case-insensitive) to enable the action. */
  typeToConfirm?: string;
  children?: ReactNode;
  onConfirm: (values: ConfirmValues) => Promise<void>;
}

/** Accessible confirmation screen for sensitive and destructive actions. */
export function ConfirmDialog({ trigger, title, description, confirmLabel, variant = "destructive", requirePassword, typeToConfirm, children, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const ready = (!typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase()) && (!requirePassword || password.length > 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm({ password, typed: typed.trim() });
      setOpen(false);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTyped("");
          setPassword("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription asChild>
              <div>{description}</div>
            </DialogDescription>
          </DialogHeader>
          {children}
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          {typeToConfirm ? (
            <FormField id="confirm-typed" label={`Type ${typeToConfirm} to confirm`}>
              <Input id="confirm-typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false} />
            </FormField>
          ) : null}
          {requirePassword ? (
            <FormField id="confirm-password" label="Your password">
              <PasswordInput id="confirm-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </FormField>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={variant} disabled={!ready || pending}>
              {pending ? <Spinner /> : null}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
