import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center sm:py-12">
      <Logo className="mb-8" size="lg" />
      <main className="w-full max-w-[420px]">{children}</main>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:text-foreground">Terms</Link>
      </p>
    </div>
  );
}
