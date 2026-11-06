"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { friendlyError } from "@/lib/domain/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface Props {
  token: string;
  inviterName: string;
  signedIn: boolean;
  alreadyPaired: boolean;
}

export function InvitationAccept({ token, inviterName, signedIn, alreadyPaired }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = encodeURIComponent(`/invite/${token}`);

  if (!signedIn) {
    return (
      <div className="grid gap-3">
        <Button asChild size="lg">
          <Link href={`/register?next=${next}`}>Create an account to accept</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={`/login?next=${next}`}>I already have an account</Link>
        </Button>
      </div>
    );
  }

  if (alreadyPaired) {
    return (
      <Alert>
        You&apos;re already connected with a partner. Pairvella supports one partner at a time.{" "}
        <Link href="/dashboard" className="underline underline-offset-2">Go to your space</Link>
      </Alert>
    );
  }

  async function accept() {
    setPending(true);
    setError(null);
    const { error: rpcError } = await getSupabaseBrowserClient().rpc("accept_invitation", { p_token: token });
    if (rpcError) {
      setError(friendlyError(rpcError));
      setPending(false);
      return;
    }
    router.replace("/chat");
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button size="lg" onClick={accept} disabled={pending}>
        {pending ? <Spinner /> : null}
        Accept and connect with {inviterName}
      </Button>
      <Button asChild variant="ghost">
        <Link href="/dashboard">Not now</Link>
      </Button>
    </div>
  );
}
