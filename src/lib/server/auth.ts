import "server-only";

import { randomBytes, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server/env";
import { bearerToken } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createSupabaseServerClient,
  createSupabaseStatelessClient,
  createSupabaseTokenClient,
} from "@/lib/supabase/server";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Opaque internal auth identity: unguessable, not derived from the username, never receives mail. */
export function generateAuthEmail(): string {
  const bytes = randomBytes(22);
  let id = "";
  for (const b of bytes) id += BASE62[b % 62];
  return `u.${id.toLowerCase()}@${serverEnv.authIdentityDomain}`;
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Postgres bytea literal for PostgREST RPC parameters. */
export function toByteaHex(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}

/** Resolves the authenticated caller from a bearer token (mobile) or the cookie session (web). */
export async function getAuthedClient(
  request: NextRequest,
): Promise<{ client: SupabaseClient; userId: string; accessToken: string } | null> {
  const token = bearerToken(request);
  const client = token ? createSupabaseTokenClient(token) : await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims(token ?? undefined);
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  // The JWT has been verified above, so the stored access token can be used for user-level Auth calls.
  const accessToken = token ?? (await client.auth.getSession()).data.session?.access_token;
  if (!accessToken) return null;
  return { client, userId: sub, accessToken };
}

/** Calls a user-scoped Supabase Auth endpoint with the caller's own access token. */
export async function authUserRequest(
  accessToken: string,
  path: "/user" | "/logout?scope=others",
  init: { method: "PUT" | "POST"; body?: unknown },
): Promise<{ ok: boolean; status: number; message?: string }> {
  const res = await fetch(`${publicEnv.supabaseUrl}/auth/v1${path}`, {
    method: init.method,
    headers: {
      apikey: publicEnv.supabaseKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.ok) return { ok: true, status: res.status };
  const data = (await res.json().catch(() => null)) as { msg?: string; message?: string } | null;
  return { ok: false, status: res.status, message: data?.msg ?? data?.message };
}

/**
 * Re-verifies a user's password through Supabase Auth without touching the caller's
 * session (uses a throwaway, non-persisting client and revokes the extra session).
 */
export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("server_get_account_private", { p_user_id: userId });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row?.auth_email) return false;
  const probe = createSupabaseStatelessClient();
  const { data: signIn, error: signInError } = await probe.auth.signInWithPassword({
    email: row.auth_email as string,
    password,
  });
  if (signInError || !signIn.session) return false;
  await probe.auth.signOut({ scope: "local" });
  return true;
}
