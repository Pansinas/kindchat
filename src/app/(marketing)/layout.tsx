import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1.5" aria-label="Account">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Create your space</Link>
          </Button>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© 2026 Pairvella · A quieter place for two.</p>
          <nav className="flex gap-5" aria-label="Legal">
            <Link className="hover:text-foreground" href="/privacy">Privacy</Link>
            <Link className="hover:text-foreground" href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
