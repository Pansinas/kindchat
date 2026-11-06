import type { NextRequest } from "next/server";
import { registerSchema } from "@/lib/domain/validation";
import { publicEnv } from "@/lib/env";
import { generateAuthEmail, randomToken, sha256, toByteaHex } from "@/lib/server/auth";
import { sendEmail, verifyRecoveryEmail } from "@/lib/server/email";
import { apiError, apiOk, audit, clientIp, isMobileClient, parseJson, rateLimit, sameOriginOrBearer } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!sameOriginOrBearer(request) && !isMobileClient(request)) return apiError(403, "FORBIDDEN");
  const parsed = await parseJson(request, registerSchema);
  if (!parsed.ok) return parsed.response;
  const { username, displayName, password, recoveryEmail } = parsed.data;
  const ip = clientIp(request);

  if (!(await rateLimit([{ key: `register:ip:${ip}`, limit: 5, windowSeconds: 3600 }]))) {
    return apiError(429, "TOO_MANY_ATTEMPTS", undefined, { "Retry-After": "3600" });
  }

  const admin = createSupabaseAdminClient();
  const { data: available, error: availabilityError } = await admin.rpc("server_username_available", { p_username: username });
  if (availabilityError) return apiError(500, "UNKNOWN");
  if (!available) return apiError(409, "USERNAME_UNAVAILABLE");

  // 1) Create the Supabase Auth identity (public sign-ups are disabled; only this server can create users).
  const authEmail = generateAuthEmail();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    const weak = createError?.code === "weak_password" || /password/i.test(createError?.message ?? "");
    return apiError(weak ? 400 : 500, weak ? "WEAK_PASSWORD" : "UNKNOWN", weak ? createError?.message : undefined);
  }
  const userId = created.user.id;

  // 2) Provision profile/settings/mapping in one transaction; compensate on failure.
  const { error: provisionError } = await admin.rpc("server_provision_account", {
    p_user_id: userId,
    p_username: username,
    p_display_name: displayName,
    p_auth_email: authEmail,
  });
  if (provisionError) {
    await admin.auth.admin.deleteUser(userId);
    const taken = provisionError.message.includes("USERNAME_UNAVAILABLE");
    return apiError(taken ? 409 : 500, taken ? "USERNAME_UNAVAILABLE" : "UNKNOWN");
  }

  // 3) Optional recovery email: stored only after the owner confirms it.
  if (recoveryEmail) {
    const token = randomToken();
    const { error } = await admin.rpc("server_start_recovery_email_verification", {
      p_user_id: userId,
      p_email: recoveryEmail,
      p_token_hash: toByteaHex(sha256(token)),
    });
    if (!error) {
      await sendEmail(verifyRecoveryEmail(recoveryEmail, `${publicEnv.appUrl}/verify-email?token=${token}`));
    }
  }

  // 4) Sign in (session cookies for web, tokens in the body for mobile).
  const supabase = await createSupabaseServerClient();
  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({ email: authEmail, password });
  await audit(userId, "auth.registered", ip);
  if (signInError || !session.session) return apiOk({ user: { id: userId, username }, signedIn: false }, 201);

  if (isMobileClient(request)) {
    const { access_token, refresh_token, expires_at } = session.session;
    return apiOk({ user: { id: userId, username }, session: { access_token, refresh_token, expires_at } }, 201);
  }
  return apiOk({ user: { id: userId, username }, signedIn: true }, 201);
}
