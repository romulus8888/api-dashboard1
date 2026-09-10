import { createHmac } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/lead";

export interface RateLimitConfig {
  secret: string;
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class RateLimitConfigError extends Error {
  constructor(message = "Missing demo rate limit configuration.") {
    super(message);
    this.name = "RateLimitConfigError";
  }
}

export function getRateLimitConfig(): RateLimitConfig {
  const secret = process.env.DEMO_RATE_LIMIT_SECRET;
  const maxRequests = Number.parseInt(process.env.DEMO_RATE_LIMIT_MAX_REQUESTS ?? "10", 10);
  const windowSeconds = Number.parseInt(process.env.DEMO_RATE_LIMIT_WINDOW_SECONDS ?? "3600", 10);

  if (!secret) {
    throw new RateLimitConfigError();
  }

  if (!Number.isFinite(maxRequests) || maxRequests < 1) {
    throw new RateLimitConfigError("DEMO_RATE_LIMIT_MAX_REQUESTS must be a positive integer.");
  }

  if (!Number.isFinite(windowSeconds) || windowSeconds < 1) {
    throw new RateLimitConfigError("DEMO_RATE_LIMIT_WINDOW_SECONDS must be a positive integer.");
  }

  return {
    secret,
    maxRequests,
    windowSeconds,
  };
}

export function hashClientIdentifier(clientIp: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`demo:generate-lead:${clientIp}`)
    .digest("hex");
}

export async function checkDemoRateLimit(
  supabase: SupabaseClient<Database>,
  bucketKey: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("check_demo_rate_limit", {
    p_bucket_key: bucketKey,
    p_max_requests: config.maxRequests,
    p_window_seconds: config.windowSeconds,
  });

  if (error) {
    throw error;
  }

  return {
    allowed: Boolean(data?.allowed),
    remaining: data?.remaining ?? 0,
    retryAfterSeconds: data?.retry_after_seconds ?? 0,
  };
}
