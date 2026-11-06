import type { NextRequest } from "next/server";
import { apiError, apiOk, sameOriginOrBearer } from "@/lib/server/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!sameOriginOrBearer(request)) return apiError(403, "FORBIDDEN");
  const everywhere = request.nextUrl.searchParams.get("scope") === "global";
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: everywhere ? "global" : "local" });
  return apiOk({ ok: true });
}
