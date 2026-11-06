import type { NextRequest } from "next/server";
import { passwordConfirmSchema, recoveryEmailSchema } from "@/lib/domain/validation";
import { publicEnv } from "@/lib/env";
import { getAuthedClient, randomToken, sha256, toByteaHex, verifyPassword } from "@/lib/server/auth";
import { sendEmail, verifyRecoveryEmail } from "@/lib/server/email";
import { apiError, apiOk, audit, clientIp, parseJson, rateLimit, sameOriginOrBearer } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function mask(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "•••";
  return `${local.slice(0, 1)}${"•".repeat(Math.max(1, Math.min(6, local.length - 1)))}@${domain}`;
}

/** The account owner's own recovery-email status (never exposes the internal auth identity). */
export async function GET(request: NextRequest) {
  const auth = await getAuthedClient(request);
  if (!auth) return apiError(401, "NOT_AUTHENTICATED");
  const admin = createSupabaseAdminClient();
  const { data } = await admin.rpc("server_get_account_private", { p_user_id: auth.userId });
  const row = Array.isArray(data) ? data[0] : null;
  return apiOk({
    recoveryEmail: row?.recovery_email ? mask(row.recovery_email) : null,
    verified: Boolean(row?.recovery_email_verified),
  });
}

/** Starts verification of a new recovery address. Requires the current password. */
export async function POST(request: NextRequest) {
  if (!sameOriginOrBearer(request)) return apiError(403, "FORBIDDEN");
  const auth = await getAuthedClient(request);
  if (!auth) return apiError(401, "NOT_AUTHENTICATED");
  const parsed = await parseJson(request, recoveryEmailSchema);
  if (!parsed.ok) return parsed.response;
  if (!(await rateLimit([{ key: `recovery_email:${auth.userId}`, limit: 5, windowSeconds: 3600 }]))) {
    return apiError(429, "TOO_MANY_ATTEMPTS");
  }
  if (!(await verifyPassword(auth.userId, parsed.data.password))) return apiError(400, "INVALID_PASSWORD");

  const token = randomToken();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("server_start_recovery_email_verification", {
    p_user_id: auth.userId,
    p_email: parsed.data.email,
    p_token_hash: toByteaHex(sha256(token)),
  });
  if (error) return apiError(500, "UNKNOWN");
  const sent = await sendEmail(verifyRecoveryEmail(parsed.data.email, `${publicEnv.appUrl}/verify-email?token=${token}`));
  if (!sent) return apiError(503, "EMAIL_NOT_CONFIGURED");
  await audit(auth.userId, "account.recovery_email_verification_sent", clientIp(request));
  return apiOk({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!sameOriginOrBearer(request)) return apiError(403, "FORBIDDEN");
  const auth = await getAuthedClient(request);
  if (!auth) return apiError(401, "NOT_AUTHENTICATED");
  const parsed = await parseJson(request, passwordConfirmSchema);
  if (!parsed.ok) return parsed.response;
  if (!(await verifyPassword(auth.userId, parsed.data.password))) return apiError(400, "INVALID_PASSWORD");
  const admin = createSupabaseAdminClient();
  await admin.rpc("server_remove_recovery_email", { p_user_id: auth.userId });
  await audit(auth.userId, "account.recovery_email_removed", clientIp(request));
  return apiOk({ ok: true });
}
