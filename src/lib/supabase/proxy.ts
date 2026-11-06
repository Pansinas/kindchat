import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

const APP_PREFIXES = ["/dashboard", "/chat", "/connect", "/settings", "/onboarding"];
const GUEST_ONLY = ["/login", "/register"];

/**
 * Refreshes the Supabase session cookie on navigation and performs coarse route
 * protection. This is a convenience, not a security boundary: data access is
 * enforced by RLS and every route handler re-checks the session.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseKey) return response;

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims() verifies the JWT and refreshes an expired session when needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  const redirectTo = (pathname: string, keepNext: boolean) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    if (keepNext) url.searchParams.set("next", path);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!signedIn && APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return redirectTo("/login", true);
  }
  if (signedIn && GUEST_ONLY.includes(path)) {
    return redirectTo("/dashboard", false);
  }
  return response;
}
