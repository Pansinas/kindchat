"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton({ everywhere = false, ...props }: ButtonProps & { everywhere?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await api(`/auth/logout${everywhere ? "?scope=global" : ""}`, { method: "POST" });
        } finally {
          await getSupabaseBrowserClient().auth.signOut({ scope: "local" }).catch(() => undefined);
          router.replace("/login");
          router.refresh();
        }
      }}
      {...props}
    >
      {props.children ?? (
        <>
          <LogOut /> Sign out
        </>
      )}
    </Button>
  );
}
