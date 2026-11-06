import type { NextRequest } from "next/server";
import { USERNAME_PATTERN } from "@/lib/domain/validation";
import { apiError, apiOk, clientIp, rateLimit } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username")?.trim() ?? "";
  if (!USERNAME_PATTERN.test(username)) return apiOk({ available: false, reason: "invalid" });
  if (!(await rateLimit([{ key: `username_check:${clientIp(request)}`, limit: 60, windowSeconds: 600 }]))) {
    return apiError(429, "TOO_MANY_ATTEMPTS");
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("server_username_available", { p_username: username });
  if (error) return apiError(500, "UNKNOWN");
  return apiOk({ available: data === true });
}
