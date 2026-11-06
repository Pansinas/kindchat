import type { NextRequest } from "next/server";
import { passwordConfirmSchema } from "@/lib/domain/validation";
import { getAuthedClient, verifyPassword } from "@/lib/server/auth";
import { apiError, audit, clientIp, parseJson, rateLimit, sameOriginOrBearer } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Personal data export (JSON download). Requires the current password; audited. */
export async function POST(request: NextRequest) {
  if (!sameOriginOrBearer(request)) return apiError(403, "FORBIDDEN");
  const auth = await getAuthedClient(request);
  if (!auth) return apiError(401, "NOT_AUTHENTICATED");
  const parsed = await parseJson(request, passwordConfirmSchema);
  if (!parsed.ok) return parsed.response;
  if (!(await rateLimit([{ key: `export:${auth.userId}`, limit: 3, windowSeconds: 86400 }]))) {
    return apiError(429, "TOO_MANY_ATTEMPTS");
  }
  if (!(await verifyPassword(auth.userId, parsed.data.password))) return apiError(400, "INVALID_PASSWORD");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("server_export_user_data", { p_user_id: auth.userId });
  if (error) return apiError(500, "UNKNOWN");
  await audit(auth.userId, "account.data_exported", clientIp(request));

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pairvella-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
