import type { NextRequest } from "next/server";
import { deleteAccountSchema } from "@/lib/domain/validation";
import { getAuthedClient, verifyPassword } from "@/lib/server/auth";
import { apiError, apiOk, audit, clientIp, parseJson, rateLimit, sameOriginOrBearer } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Permanently deletes the account. Ends any active couple space first (the partner keeps
 * the 30-day export window for the shared history; the deleted user's messages remain
 * attributed to "Deleted account" until that window closes and the history is purged).
 */
export async function POST(request: NextRequest) {
  if (!sameOriginOrBearer(request)) return apiError(403, "FORBIDDEN");
  const auth = await getAuthedClient(request);
  if (!auth) return apiError(401, "NOT_AUTHENTICATED");
  const parsed = await parseJson(request, deleteAccountSchema);
  if (!parsed.ok) return parsed.response;
  if (!(await rateLimit([{ key: `delete:${auth.userId}`, limit: 5, windowSeconds: 3600 }]))) {
    return apiError(429, "TOO_MANY_ATTEMPTS");
  }

  const { data: profile } = await auth.client.from("profiles").select("username").eq("id", auth.userId).single();
  if (!profile || profile.username.toLowerCase() !== parsed.data.confirmUsername.toLowerCase()) {
    return apiError(400, "CONFIRMATION_MISMATCH");
  }
  if (!(await verifyPassword(auth.userId, parsed.data.password))) return apiError(400, "INVALID_PASSWORD");

  const admin = createSupabaseAdminClient();
  const { error: prepError } = await admin.rpc("server_prepare_account_deletion", { p_user_id: auth.userId });
  if (prepError) return apiError(500, "UNKNOWN");

  // Remove avatar files.
  const { data: files } = await admin.storage.from("avatars").list(auth.userId);
  if (files?.length) await admin.storage.from("avatars").remove(files.map((f) => `${auth.userId}/${f.name}`));

  await auth.client.auth.signOut({ scope: "global" }).catch(() => undefined);
  const { error } = await admin.auth.admin.deleteUser(auth.userId);
  if (error) return apiError(500, "UNKNOWN");
  await audit(auth.userId, "account.deleted_completed", clientIp(request));
  return apiOk({ ok: true });
}
