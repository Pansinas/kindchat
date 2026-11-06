import type { NextRequest } from "next/server";
import { loginSchema } from "@/lib/domain/validation";
import { apiError, apiOk, atLeast, audit, clientIp, isMobileClient, parseJson, rateLimit, sameOriginOrBearer } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient, createSupabaseStatelessClient } from "@/lib/supabase/server";

type LoginResult =
  | { ok: true; userId: string; session?: { access_token: string; refresh_token: string; expires_at?: number } }
  | { ok: false; userId?: string };

/**
 * Username login. The username is resolved to the private auth identity on the server;
 * Supabase Auth verifies the password. Unknown usernames and wrong passwords produce the
 * same response, padded to the same minimum duration.
 */
export async function POST(request: NextRequest) {
  const mobile = isMobileClient(request);
  if (!mobile && !sameOriginOrBearer(request)) return apiError(403, "FORBIDDEN");
  const parsed = await parseJson(request, loginSchema);
  if (!parsed.ok) return parsed.response;
  const { username, password } = parsed.data;
  const ip = clientIp(request);
  const usernameKey = username.toLowerCase();

  const allowed = await rateLimit([
    { key: `login:ip:${ip}`, limit: 20, windowSeconds: 900 },
    { key: `login:user:${usernameKey}`, limit: 10, windowSeconds: 900 },
  ]);
  if (!allowed) return apiError(429, "TOO_MANY_ATTEMPTS", undefined, { "Retry-After": "900" });

  const result = await atLeast<LoginResult>(
    700,
    (async () => {
      const admin = createSupabaseAdminClient();
      const { data } = await admin.rpc("server_resolve_login", { p_username: username });
      const identity = Array.isArray(data) ? data[0] : null;
      if (!identity?.auth_email) return { ok: false };

      if (mobile) {
        const client = createSupabaseStatelessClient();
        const { data: auth, error } = await client.auth.signInWithPassword({ email: identity.auth_email, password });
        if (error || !auth.session) return { ok: false, userId: identity.user_id };
        const { access_token, refresh_token, expires_at } = auth.session;
        return { ok: true, userId: identity.user_id, session: { access_token, refresh_token, expires_at } };
      }
      const supabase = await createSupabaseServerClient();
      const { data: auth, error } = await supabase.auth.signInWithPassword({ email: identity.auth_email, password });
      if (error || !auth.session) return { ok: false, userId: identity.user_id };
      return { ok: true, userId: identity.user_id };
    })(),
  );

  if (!result.ok) {
    await audit(result.userId ?? null, "auth.login_failed", ip, result.userId ? {} : { reason: "unknown_username" });
    return apiError(401, "INVALID_CREDENTIALS");
  }
  await audit(result.userId, "auth.login_succeeded", ip);
  return apiOk(mobile ? { userId: result.userId, session: result.session } : { userId: result.userId });
}
