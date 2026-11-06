import type { Metadata } from "next";
import { ConnectView } from "@/components/pairing/connect-view";

export const metadata: Metadata = { title: "Connect" };

export default function ConnectPage() {
  return <ConnectView />;
}
