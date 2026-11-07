"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { fireAndForget, getSupabaseBrowserClient } from "@/lib/supabase/client";
import { browserTimeZone } from "@/lib/domain/timezone";
import type { MyState } from "@/types/app";
import { ConversationProvider } from "./conversation-provider";

interface AppStateValue {
  state: MyState;
  userId: string;
  refresh: () => Promise<void>;
  setSettingsLocal: (patch: Partial<MyState["settings"]>) => void;
  /** Increments whenever a founder-chat message arrives (lets the founder inbox refresh). */
  founderActivity: number;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function useAppState(): AppStateValue {
  const value = use(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside <AppStateProvider>");
  return value;
}

/**
 * Holds the signed-in user's state (profile, settings, couple, requests) and keeps it
 * fresh through the private `user:<id>` Realtime topic. Also maintains last-seen.
 */
export function AppStateProvider({ initialState, children }: { initialState: MyState; children: ReactNode }) {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [state, setState] = useState<MyState>(initialState);
  const [founderActivity, setFounderActivity] = useState(0);
  const userId = initialState.profile.id;
  const prevConversation = useRef<string | null>(initialState.couple?.conversation_id ?? null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_state");
    if (error) {
      if (error.message === "NOT_AUTHENTICATED") router.replace("/login");
      return;
    }
    if (data) setState(data as MyState);
  }, [supabase, router]);

  const setSettingsLocal = useCallback((patch: Partial<MyState["settings"]>) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  }, []);

  // Keep the stored time zone in sync with this device (shared only with chat partners).
  useEffect(() => {
    const tz = browserTimeZone();
    if (!tz || tz === initialState.settings.timezone) return;
    supabase
      .from("user_settings")
      .update({ timezone: tz })
      .eq("user_id", initialState.profile.id)
      .then(({ error }) => {
        if (!error) setState((s) => ({ ...s, settings: { ...s.settings, timezone: tz } }));
      });
  }, [supabase, initialState.settings.timezone, initialState.profile.id]);

  // Apply the stored theme preference once.
  useEffect(() => {
    setTheme(initialState.settings.theme);
  }, [initialState.settings.theme, setTheme]);

  // Pairing transitions (from any source: this tab, the partner, another device).
  useEffect(() => {
    const current = state.couple?.conversation_id ?? null;
    if (current === prevConversation.current) return;
    if (current && !prevConversation.current) {
      toast.success(`You're now connected with ${state.couple?.partner.display_name}.`);
      router.push("/chat");
    } else if (!current && prevConversation.current) {
      toast("Your couple space has ended.", { description: "You can export the conversation from Settings for 30 days." });
      router.push("/dashboard");
    }
    prevConversation.current = current;
  }, [state.couple, router]);

  // Private per-user topic: requests, pairing events.
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`user:${userId}`, { config: { private: true } })
        .on("broadcast", { event: "request.received" }, () => {
          toast("New connection request", { description: "Open Connect to respond." });
          void refresh();
        })
        .on("broadcast", { event: "request.updated" }, () => void refresh())
        .on("broadcast", { event: "pairing.created" }, () => void refresh())
        .on("broadcast", { event: "pairing.ended" }, () => void refresh())
        .on("broadcast", { event: "founder.message" }, () => {
          setFounderActivity((n) => n + 1);
          void refresh();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void refresh();
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refresh]);

  // Last seen heartbeat while the app is visible.
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") fireAndForget(supabase.rpc("touch_last_seen"), "touch_last_seen");
    };
    beat();
    const interval = window.setInterval(beat, 60_000);
    const onVisibility = () => {
      beat();
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", beat);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", beat);
    };
  }, [supabase, refresh]);

  const value = useMemo(
    () => ({ state, userId, refresh, setSettingsLocal, founderActivity }),
    [state, userId, refresh, setSettingsLocal, founderActivity],
  );

  return (
    <AppStateContext value={value}>
      {state.couple ? (
        <ConversationProvider
          key={state.couple.conversation_id}
          conversationId={state.couple.conversation_id}
          userId={userId}
          partnerId={state.couple.partner.id}
          partnerName={state.couple.partner.display_name}
          settings={state.settings}
          kind="couple"
        >
          {children}
        </ConversationProvider>
      ) : (
        children
      )}
    </AppStateContext>
  );
}
