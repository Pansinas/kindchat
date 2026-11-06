import "server-only";

import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { firstIssue } from "@/lib/domain/validation";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ApiErrorBody {
  error: { code: string; message?: string };
}

export function apiError(status: number, code: string, message?: string, headers?: HeadersInit) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message } }, { status, headers: noStore(headers) });
}

export function apiOk<T>(body: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers: noStore(headers) });
}

function noStore(headers?: HeadersInit): Headers {
  const h = new Headers(headers);
  h.set("Cache-Control", "no-store");
  return h;
}

/** Best-effort client IP (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** HMAC of the IP so audit logs can correlate abuse without storing raw addresses. */
export function hashIp(ip: string): string {
  return createHmac("sha256", serverEnv.ipHashSecret).update(ip).digest("hex").slice(0, 32);
}

export function isMobileClient(request: NextRequest): boolean {
  return request.headers.get("x-client") === "mobile";
}

export function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * CSRF defence for cookie-authenticated requests: the Origin must be our own.
 * Requests that carry a bearer token (mobile) are not cookie-authenticated and skip this check.
 */
export function sameOriginOrBearer(request: NextRequest): boolean {
  if (bearerToken(request)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host;
    const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return originHost === requestHost || origin === publicEnv.appUrl;
  } catch {
    return false;
  }
}

export async function parseJson<S extends z.ZodType>(
  request: NextRequest,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: apiError(400, "VALIDATION_ERROR", "Invalid JSON body.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: apiError(400, "VALIDATION_ERROR", firstIssue(parsed.error)) };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Applies every bucket; returns false if any is exhausted.
 * Backed by Postgres (private.rate_limits) so limits hold across serverless instances.
 */
export async function rateLimit(buckets: Array<{ key: string; limit: number; windowSeconds: number }>) {
  const admin = createSupabaseAdminClient();
  for (const b of buckets) {
    const { data, error } = await admin.rpc("server_rate_limit_hit", {
      p_bucket: b.key,
      p_limit: b.limit,
      p_window_seconds: b.windowSeconds,
    });
    if (error) throw new Error(`rate limit check failed: ${error.message}`);
    if (data !== true) return false;
  }
  return true;
}

export async function audit(actor: string | null, event: string, ip: string | null, metadata: Record<string, unknown> = {}) {
  try {
    const admin = createSupabaseAdminClient();
    await admin.rpc("server_audit", {
      p_actor: actor,
      p_event: event,
      p_ip_hash: ip ? hashIp(ip) : null,
      p_metadata: metadata,
    });
  } catch (err) {
    console.error("audit log write failed", err);
  }
}

/** Pads a response to a minimum duration so success/failure paths are not distinguishable by timing. */
export async function atLeast<T>(ms: number, work: Promise<T>): Promise<T> {
  const jitter = Math.floor(Math.random() * 150);
  const [result] = await Promise.all([work, new Promise((r) => setTimeout(r, ms + jitter))]);
  return result;
}
