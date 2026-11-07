import type { Metadata } from "next";
import { TeamChatView } from "@/components/founder/team-chat-view";

export const metadata: Metadata = { title: "KindChat team" };

export default function TeamPage() {
  return <TeamChatView />;
}
