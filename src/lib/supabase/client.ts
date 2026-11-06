"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertPublicEnv, publicEnv } from "@/lib/env";

let browserClient: SupabaseClient | undefined;

/** Singleton browser client: carries the user's session (cookies) and talks to PostgREST + Realtime. */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    assertPublicEnv();
    browserClient = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseKey);
  }
  return browserClient;
}

/**
 * Sends a fire-and-forget request. Supabase query builders are lazy: the HTTP request is only
 * made when the builder is awaited or `.then()` is called, so `void builder` would never send it.
 */
export function fireAndForget(builder: PromiseLike<{ error: unknown }>, label: string): void {
  builder.then(
    ({ error }) => {
      if (error) console.warn(`${label} failed`, error);
    },
    (err: unknown) => console.warn(`${label} failed`, err),
  );
}
