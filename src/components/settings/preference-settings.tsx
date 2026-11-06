"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { SettingRow } from "@/components/settings/settings-section";
import { useAppState } from "@/components/providers/app-state-provider";
import { Switch } from "@/components/ui/switch";
import { friendlyError } from "@/lib/domain/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { UserSettings } from "@/types/app";

function useUpdateSetting() {
  const { state, setSettingsLocal } = useAppState();
  return async (patch: Partial<UserSettings>) => {
    const previous = state.settings;
    setSettingsLocal(patch);
    const { error } = await getSupabaseBrowserClient().from("user_settings").update(patch).eq("user_id", state.profile.id);
    if (error) {
      setSettingsLocal(previous);
      toast.error(friendlyError(error));
    }
  };
}

export function PrivacySettings() {
  const { state } = useAppState();
  const update = useUpdateSetting();
  const s = state.settings;
  return (
    <div className="divide-y divide-border">
      <SettingRow title="Show when I'm online" description="If you turn this off, you also won't see when your partner is online.">
        <Switch checked={s.show_online_status} onCheckedChange={(v) => update({ show_online_status: v })} aria-label="Show when I'm online" />
      </SettingRow>
      <SettingRow title="Show my last seen" description="If you hide your last seen, you won't see your partner's either.">
        <Switch checked={s.show_last_seen} onCheckedChange={(v) => update({ show_last_seen: v })} aria-label="Show my last seen" />
      </SettingRow>
      <SettingRow title="Let people find me by username" description="Turn off once you're connected to stop new requests. Invitation links still work.">
        <Switch checked={s.discoverable_by_username} onCheckedChange={(v) => update({ discoverable_by_username: v })} aria-label="Let people find me by username" />
      </SettingRow>
    </div>
  );
}

export function NotificationSettings() {
  const { state } = useAppState();
  const update = useUpdateSetting();
  const s = state.settings;
  return (
    <div className="divide-y divide-border">
      <SettingRow title="Sound" description="Play a soft chime for new messages while Pairvella is in the background.">
        <Switch checked={s.notify_sound} onCheckedChange={(v) => update({ notify_sound: v })} aria-label="Sound" />
      </SettingRow>
      <SettingRow title="Desktop notifications" description="Show a notification while Pairvella is open in another tab. Message text is never included.">
        <Switch
          checked={s.notify_desktop}
          aria-label="Desktop notifications"
          onCheckedChange={async (v) => {
            if (v) {
              if (!("Notification" in window)) return toast.error("This browser doesn't support notifications.");
              const permission = await Notification.requestPermission();
              if (permission !== "granted") return toast.error("Notifications are blocked in your browser settings.");
            }
            await update({ notify_desktop: v });
          }}
        />
      </SettingRow>
    </div>
  );
}

const THEMES = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

export function AppearanceSettings() {
  const { state } = useAppState();
  const { setTheme } = useTheme();
  const update = useUpdateSetting();
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
      {THEMES.map(({ value, label, icon: Icon }) => {
        const active = state.settings.theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            type="button"
            onClick={() => {
              setTheme(value);
              void update({ theme: value });
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm transition-colors",
              active ? "border-lavender bg-accent text-accent-foreground" : "border-border hover:bg-muted",
            )}
          >
            <Icon className="size-5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
