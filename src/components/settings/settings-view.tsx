"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ProfileForm } from "@/components/profile/profile-form";
import { AccountSettings } from "@/components/settings/account-settings";
import { DeleteAccount, DisconnectPartner, ExportData, SessionControls } from "@/components/settings/data-settings";
import { AppearanceSettings, NotificationSettings, PrivacySettings } from "@/components/settings/preference-settings";
import { SettingsSection } from "@/components/settings/settings-section";

const SECTIONS = [
  ["profile", "Profile"],
  ["account", "Account"],
  ["privacy", "Privacy"],
  ["notifications", "Notifications"],
  ["appearance", "Appearance"],
  ["data", "Your data"],
  ["partner", "Partner"],
  ["danger", "Delete account"],
] as const;

export function SettingsView() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <PageHeader title="Settings" />
      <div className="grid gap-8 lg:grid-cols-[180px_1fr]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-6 grid gap-1 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid min-w-0 gap-6">
          <SettingsSection id="profile" title="Profile" description="What your partner sees.">
            <ProfileForm />
          </SettingsSection>
          <SettingsSection id="account" title="Account" description="Sign-in details and recovery.">
            <AccountSettings />
          </SettingsSection>
          <SettingsSection id="privacy" title="Privacy">
            <PrivacySettings />
          </SettingsSection>
          <SettingsSection id="notifications" title="Notifications">
            <NotificationSettings />
          </SettingsSection>
          <SettingsSection id="appearance" title="Appearance">
            <AppearanceSettings />
          </SettingsSection>
          <SettingsSection id="data" title="Your data">
            <ExportData />
          </SettingsSection>
          <SettingsSection id="partner" title="Partner">
            <DisconnectPartner />
          </SettingsSection>
          <SettingsSection id="sessions" title="Sessions">
            <SessionControls />
          </SettingsSection>
          <SettingsSection id="danger" title="Delete account" tone="danger">
            <DeleteAccount />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
