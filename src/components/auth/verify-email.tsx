"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";
import { friendlyError } from "@/lib/domain/errors";

export function VerifyEmail() {
  const params = useSearchParams();
  const started = useRef(false);
  const [token] = useState(() => params.get("token"));
  const [state, setState] = useState<{ status: "pending" | "done" | "error"; message?: string }>(() =>
    token ? { status: "pending" } : { status: "error", message: "This link is invalid or has expired." },
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    window.history.replaceState(null, "", "/verify-email");
    if (!token) return;
    api("/account/recovery-email/verify", { body: { token } })
      .then(() => setState({ status: "done" }))
      .catch((err) => setState({ status: "error", message: friendlyError(err) }));
  }, [token]);

  if (state.status === "pending") {
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
        <Spinner /> Confirming…
      </p>
    );
  }
  return (
    <div className="grid gap-5">
      <Alert variant={state.status === "done" ? "success" : "destructive"}>
        {state.status === "done" ? "Your recovery email is confirmed." : state.message}
      </Alert>
      <Button asChild variant="outline">
        <Link href="/settings#account">Go to settings</Link>
      </Button>
    </div>
  );
}
