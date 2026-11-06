import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/layout/logo";
import { InvitationAccept } from "@/components/pairing/invitation-accept";
import { UserAvatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "You're invited",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

interface Preview {
  inviter_username: string;
  inviter_display_name: string;
  inviter_avatar_path: string | null;
  expires_at: string;
}

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center">
      <Logo className="mb-8" />
      <main className="w-full max-w-[420px]">
        <Suspense fallback={<Skeleton className="h-80 rounded-2xl" />}>
          <Invitation params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: preview }, { data: claims }] = await Promise.all([
    supabase.rpc("preview_invitation", { p_token: token }),
    supabase.auth.getClaims(),
  ]);
  const invite = ((preview as Preview[] | null) ?? [])[0];
  const signedIn = Boolean(claims?.claims?.sub);

  if (!invite) {
    return (
      <Card>
        <CardContent className="grid gap-4 text-center">
          <h1 className="text-xl font-semibold tracking-tight">This invitation isn&apos;t available</h1>
          <p className="text-muted-foreground">
            The link may have expired, been used already, or been replaced by a newer one. Ask your partner to send a new link.
          </p>
          <Link href="/" className="text-sm underline underline-offset-4">Go to Pairvella</Link>
        </CardContent>
      </Card>
    );
  }

  let alreadyPaired = false;
  if (signedIn) {
    const { data: state } = await supabase.rpc("get_my_state");
    alreadyPaired = Boolean((state as { couple?: unknown } | null)?.couple);
  }

  return (
    <Card>
      <CardContent className="grid gap-6 text-center">
        <div className="mx-auto">
          <UserAvatar name={invite.inviter_display_name} path={invite.inviter_avatar_path} className="size-20 text-xl" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {invite.inviter_display_name} invited you to Pairvella
          </h1>
          <p className="mt-2 text-muted-foreground">
            @{invite.inviter_username} wants to share a private space with you. Only the two of you will be able to see it.
          </p>
        </div>
        <InvitationAccept token={token} inviterName={invite.inviter_display_name} signedIn={signedIn} alreadyPaired={alreadyPaired} />
        <p className="text-xs text-muted-foreground">This invitation expires on {formatDate(invite.expires_at)}.</p>
      </CardContent>
    </Card>
  );
}
