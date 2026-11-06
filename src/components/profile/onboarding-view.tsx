"use client";

import { useRouter } from "next/navigation";
import { ProfileForm } from "@/components/profile/profile-form";
import { useAppState } from "@/components/providers/app-state-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function OnboardingView() {
  const router = useRouter();
  const { state } = useAppState();
  const next = state.couple ? "/chat" : "/connect";

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6 px-5 py-8 sm:px-8 sm:py-12">
      <div>
        <p className="text-sm text-muted-foreground">Step 1 of 2</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome, {state.profile.display_name}</h1>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          Add a photo so your partner recognises you. You can change this any time.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>Your username is @{state.profile.username}.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm submitLabel="Save and continue" onSaved={() => router.push(next)} />
        </CardContent>
      </Card>
      <Button variant="ghost" className="justify-self-center" onClick={() => router.push(next)}>
        Skip for now
      </Button>
    </div>
  );
}
