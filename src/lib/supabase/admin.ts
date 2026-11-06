import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertPublicEnv, publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server/env";

/**
 * Privileged client using the Supabase SECRET key. Bypasses RLS.
 * Only for route handlers performing operations that genuinely need it
 * (username resolution, account provisioning, recovery, export, deletion).
 */
export function createSupabaseAdminClient(): SupabaseClient {
  assertPublicEnv();
  return createClient(publicEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
