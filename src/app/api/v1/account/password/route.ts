import type { NextRequest } from "next/server";
import { changePasswordSchema } from "@/lib/domain/validation";
import { authUserRequest, getAuthedClient, verifyPassword } from "@/lib/server/auth";
import { apiError, apiOk, audit, clientIp, parseJson, rateLimit, sameOriginOrBearer } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  if (!sameOriginOrBearer(request)) return apiError(403, "FORBIDDEN");
  const auth = await getAuthedClient(request);
  if (!auth) return apiError(401, "NOT_AUTHENTICATED");
  const parsed = await parseJson(request, changePasswordSchema);
  if (!parsed.ok) return parsed.response;
  if (!(await rateLimit([{ key: `pw_change:${auth.userId}`, limit: 5, windowSeconds: 3600 }]))) {
    return apiError(429, "TOO_MANY_ATTEMPTS");
  }
  if (!(await verifyPassword(auth.userId, parsed.data.currentPassword))) {
    return apiError(400, "INVALID_PASSWORD");
  }
  // User-level update keeps the current session (the admin update would revoke every session).
  const update = await authUserRequest(auth.accessToken, "/user", { method: "PUT", body: { password: parsed.data.newPassword } });
  if (!update.ok) return apiError(400, "WEAK_PASSWORD", update.message);
  // Keep this device signed in, sign out every other session.
  await authUserRequest(auth.accessToken, "/logout?scope=others", { method: "POST" });
  await audit(auth.userId, "auth.password_changed", clientIp(request));
  return apiOk({ ok: true });
}
