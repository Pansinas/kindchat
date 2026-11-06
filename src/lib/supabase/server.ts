import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { assertPublicEnv, publicEnv } from "@/lib/env";

/**
 * Per-request server client bound to the caller's cookie session.
 * Must be created for every request (never cached across requests).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  assertPublicEnv();
  // The auth client reads the clock while initialising; mark this as request-time work.
  await connection();
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. The proxy refreshes sessions.
        }
      },
    },
  });
}

/** Stateless client authenticated with a bearer access token (used by native mobile clients). */
export function createSupabaseTokenClient(accessToken: string): SupabaseClient {
  assertPublicEnv();
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Stateless anonymous client (no cookies), e.g. for public invitation previews or password checks. */
export function createSupabaseStatelessClient(): SupabaseClient {
  assertPublicEnv();
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
