import type { Metadata } from "next";
import { OnboardingView } from "@/components/profile/onboarding-view";

export const metadata: Metadata = { title: "Welcome" };

export default function OnboardingPage() {
  return <OnboardingView />;
}
