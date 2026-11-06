/**
 * Public configuration (safe to ship to the browser).
 * Next.js inlines NEXT_PUBLIC_* values at build time, so they must be referenced literally.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

export function assertPublicEnv(): void {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.",
    );
  }
}

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${publicEnv.supabaseUrl}/storage/v1/object/public/avatars/${path}`;
}
