import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmail } from "@/components/auth/verify-email";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Confirm email", referrer: "no-referrer" };

export default function VerifyEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Recovery email</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className="h-24" />}>
          <VerifyEmail />
        </Suspense>
      </CardContent>
    </Card>
  );
}
