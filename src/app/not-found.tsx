import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-muted-foreground">It may have moved, or the link may be incomplete.</p>
      </div>
      <Button asChild variant="outline">
        <Link href="/">Back to KindChat</Link>
      </Button>
    </div>
  );
}
