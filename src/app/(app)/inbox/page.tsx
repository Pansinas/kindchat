import type { Metadata } from "next";
import { Suspense } from "react";
import { FounderInbox } from "@/components/founder/founder-inbox";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Spinner /></div>}>
      <FounderInbox />
    </Suspense>
  );
}
