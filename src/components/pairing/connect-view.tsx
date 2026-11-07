"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { InvitePanel } from "@/components/pairing/invite-panel";
import { RequestList } from "@/components/pairing/request-list";
import { UsernameSearch } from "@/components/pairing/username-search";
import { useAppState } from "@/components/providers/app-state-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ConnectView() {
  const { state } = useAppState();

  if (state.couple) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8 sm:py-12">
        <PageHeader title="You're connected" description={`You and ${state.couple.partner.display_name} share a space.`} />
        <Button asChild>
          <Link href="/chat">Open chat</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6 px-5 py-8 sm:px-8 sm:py-12">
      <PageHeader title="Connect with your partner" description="KindChat is for exactly two people. Choose how you'd like to connect." />

      {state.incoming_requests.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Requests for you</CardTitle>
            <CardDescription>Accepting opens your private space together.</CardDescription>
          </CardHeader>
          <CardContent>
            <RequestList kind="incoming" items={state.incoming_requests} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Find by username</CardTitle>
          <CardDescription>Ask your partner for their exact KindChat username.</CardDescription>
        </CardHeader>
        <CardContent>
          <UsernameSearch />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invite with a private link</CardTitle>
          <CardDescription>Not on KindChat yet? Send them a one-time link. They can create an account and accept it.</CardDescription>
        </CardHeader>
        <CardContent>
          <InvitePanel />
        </CardContent>
      </Card>

      {state.outgoing_requests.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Sent requests</CardTitle>
          </CardHeader>
          <CardContent>
            <RequestList kind="outgoing" items={state.outgoing_requests} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
