import type { NextRequest } from "next/server";
import { resetPasswordSchema } from "@/lib/domain/validation";
import { apiError, apiOk, audit, clientIp, parseJson, rateLimit, sameOriginOrBearer } from "@/lib/server/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!sameOriginOrBearer(request)) return apiError(403, "FORBIDDEN");
  const parsed = await parseJson(request, resetPasswordSchema);
  if (!parsed.ok) return parsed.response;
  const ip = clientIp(request);
  if (!(await rateLimit([{ key: `reset:ip:${ip}`, limit: 10, windowSeconds: 3600 }]))) {
    return apiError(429, "TOO_MANY_ATTEMPTS");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: parsed.data.tokenHash });
  if (error || !data.user) return apiError(400, "TOKEN_INVALID");

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (updateError) return apiError(400, "WEAK_PASSWORD", updateError.message);

  // Revoke every other session for this account.
  await supabase.auth.signOut({ scope: "others" });
  await audit(data.user.id, "auth.password_reset_completed", ip);
  return apiOk({ ok: true });
}
