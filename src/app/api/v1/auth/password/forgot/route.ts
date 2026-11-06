import type { NextRequest } from "next/server";
import { forgotPasswordSchema } from "@/lib/domain/validation";
import { publicEnv } from "@/lib/env";
import { passwordResetEmail, sendEmail } from "@/lib/server/email";
import { apiError, apiOk, atLeast, audit, clientIp, parseJson, rateLimit, sameOriginOrBearer } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Password recovery. Uses Supabase Auth's own single-use recovery token
 * (admin.generateLink) and delivers it to the user's VERIFIED recovery email.
 * Always answers identically so it cannot be used to probe accounts.
 */
export async function POST(request: NextRequest) {
  if (!sameOriginOrBearer(request)) return apiError(403, "FORBIDDEN");
  const parsed = await parseJson(request, forgotPasswordSchema);
  if (!parsed.ok) return parsed.response;
  const ip = clientIp(request);
  const username = parsed.data.username;

  const allowed = await rateLimit([
    { key: `forgot:ip:${ip}`, limit: 10, windowSeconds: 3600 },
    { key: `forgot:user:${username.toLowerCase()}`, limit: 3, windowSeconds: 3600 },
  ]);
  if (!allowed) return apiError(429, "TOO_MANY_ATTEMPTS");

  await atLeast(
    600,
    (async () => {
      const admin = createSupabaseAdminClient();
      const { data } = await admin.rpc("server_get_recovery_target", { p_username: username });
      const target = Array.isArray(data) ? data[0] : null;
      if (!target?.recovery_email) return;
      const { data: link, error } = await admin.auth.admin.generateLink({ type: "recovery", email: target.auth_email });
      const tokenHash = link?.properties?.hashed_token;
      if (error || !tokenHash) return;
      const url = `${publicEnv.appUrl}/reset-password?token_hash=${encodeURIComponent(tokenHash)}`;
      await sendEmail(passwordResetEmail(target.recovery_email, url));
      await audit(target.user_id, "auth.password_reset_requested", ip);
    })(),
  );

  return apiOk({ ok: true });
}
