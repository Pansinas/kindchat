"use client";

import { ArrowRight, Clock, MessageCircle, UserPlus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { RequestList } from "@/components/pairing/request-list";
import { useAppState } from "@/components/providers/app-state-provider";
import { useOptionalConversation } from "@/components/providers/conversation-provider";
import { Alert } from "@/components/ui/alert";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatLastSeen } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardView() {
  const { state } = useAppState();
  const conversation = useOptionalConversation();
  const name = state.profile.display_name.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <PageHeader title={`${greeting()}, ${name}`} description={state.couple ? "Your space is ready." : "Let’s bring your person here."} />

      {state.ended_couple && !state.couple ? (
        <Alert className="mb-6">
          Your previous couple space ended on {formatDate(state.ended_couple.ended_at)}. You can download that conversation from{" "}
          <Link href="/settings#data" className="underline underline-offset-2">Settings</Link> until{" "}
          {formatDate(state.ended_couple.purge_after)}, after which it will be permanently deleted.
        </Alert>
      ) : null}

      {state.couple ? (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
            <UserAvatar
              name={state.couple.partner.display_name}
              path={state.couple.partner.avatar_path}
              className="size-16 text-lg"
              online={conversation?.showPresence && conversation.partnerOnline}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xl font-semibold tracking-tight">{state.couple.partner.display_name}</p>
              <p className="text-sm text-muted-foreground">
                @{state.couple.partner.username}
                {conversation?.showPresence && conversation.partnerOnline
                  ? " · online"
                  : conversation?.partnerLastSeen
                    ? ` · ${formatLastSeen(conversation.partnerLastSeen)}`
                    : ""}
              </p>
              {state.couple.partner.bio ? <p className="mt-2 text-[15px] text-foreground/80">{state.couple.partner.bio}</p> : null}
              <p className="mt-2 text-xs text-muted-foreground">Connected since {formatDate(state.couple.paired_since)}</p>
            </div>
            <Button asChild size="lg" className="sm:self-center">
              <Link href="/chat">
                <MessageCircle />
                {conversation?.unread ? `${conversation.unread} new` : "Open chat"}
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Connect with your partner</CardTitle>
              <CardDescription>
                Search for their username or send a private invitation link. Your space opens when you both agree.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/connect">
                  <UserPlus /> Find or invite your partner <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {state.incoming_requests.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Waiting for you</CardTitle>
                <CardDescription>Someone wants to connect with you.</CardDescription>
              </CardHeader>
              <CardContent>
                <RequestList kind="incoming" items={state.incoming_requests} />
              </CardContent>
            </Card>
          ) : null}

          {state.outgoing_requests.length || state.invitation ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" />
              {state.outgoing_requests.length
                ? `Waiting for ${state.outgoing_requests[0].user.display_name} to respond.`
                : `Your invitation link is active until ${formatDate(state.invitation!.expires_at)}.`}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
