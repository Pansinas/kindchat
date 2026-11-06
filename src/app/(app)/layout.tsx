import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";
import { AppStateProvider } from "@/components/providers/app-state-provider";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MyState } from "@/types/app";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <AppSession>{children}</AppSession>
    </Suspense>
  );
}

/** Reads the session at request time (behind Suspense) and hydrates the client state. */
async function AppSession({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");

  const { data, error } = await supabase.rpc("get_my_state");
  const state = data as MyState | null;
  if (error || !state?.profile) redirect("/login");

  return (
    <AppStateProvider initialState={state}>
      <AppShell>{children}</AppShell>
    </AppStateProvider>
  );
}
