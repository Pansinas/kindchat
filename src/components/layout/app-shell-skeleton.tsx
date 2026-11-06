import { Skeleton } from "@/components/ui/skeleton";

export function AppShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-72 flex-col gap-4 border-r border-border bg-card/60 p-5 md:flex">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="mt-6 h-20 w-full rounded-2xl" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </aside>
      <main className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full max-w-2xl rounded-2xl" />
      </main>
    </div>
  );
}
