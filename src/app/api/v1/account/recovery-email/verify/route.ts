import type { NextRequest } from "next/server";
import { verifyTokenSchema } from "@/lib/domain/validation";
import { sha256, toByteaHex } from "@/lib/server/auth";
import { apiError, apiOk, clientIp, parseJson, rateLimit, sameOriginOrBearer } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Confirms ownership of a recovery email via a hashed, single-use, 24h token. */
export async function POST(request: NextRequest) {
  if (!sameOriginOrBearer(request)) return apiError(403, "FORBIDDEN");
  const parsed = await parseJson(request, verifyTokenSchema);
  if (!parsed.ok) return parsed.response;
  if (!(await rateLimit([{ key: `verify_email:${clientIp(request)}`, limit: 20, windowSeconds: 3600 }]))) {
    return apiError(429, "TOO_MANY_ATTEMPTS");
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("server_confirm_recovery_email", {
    p_token_hash: toByteaHex(sha256(parsed.data.token)),
  });
  if (error || !data) return apiError(400, "TOKEN_INVALID");
  return apiOk({ ok: true });
}
