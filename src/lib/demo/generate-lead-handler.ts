import { randomUUID } from "node:crypto";

import { ZodError } from "zod";

import { getTrustedClientIp } from "@/lib/demo/client-ip";
import {
  generateLeadRequestSchema,
  MAX_GENERATE_LEAD_BODY_BYTES,
} from "@/lib/demo/generate-lead-request-schema";
import {
  checkDemoRateLimit,
  getRateLimitConfig,
  hashClientIdentifier,
  RateLimitConfigError,
} from "@/lib/demo/rate-limit";
import { buildSyntheticLeadDraft } from "@/lib/demo/synthetic-personas";
import {
  getTurnstileSecretKey,
  isProductionEnvironment,
  TurnstileConfigError,
  TurnstileVerificationError,
  verifyTurnstileToken,
} from "@/lib/demo/turnstile";
import { insertSyntheticLead, toDemoLeadSummary } from "@/lib/leads";
import { logger } from "@/lib/logger";
import {
  createServerSupabaseClient,
  SupabaseServerConfigError,
} from "@/lib/supabase/server";
import type { DemoApiErrorCode } from "@/types/api-errors";
import type { DemoLeadSummary } from "@/types/lead";

const LOG_SCOPE = "demo-generate-lead";

interface JsonErrorBody {
  error: DemoApiErrorCode;
}

function jsonResponse(body: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

function jsonError(code: DemoApiErrorCode, status: number, headers?: HeadersInit): Response {
  return jsonResponse({ error: code } satisfies JsonErrorBody, status, headers);
}

async function readRequestBody(request: Request): Promise<string> {
  const rawBody = await request.text();

  if (rawBody.length > MAX_GENERATE_LEAD_BODY_BYTES) {
    throw new BodyTooLargeError();
  }

  return rawBody;
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("body_too_large");
    this.name = "BodyTooLargeError";
  }
}

export class InvalidJsonError extends Error {
  constructor() {
    super("invalid_json");
    this.name = "InvalidJsonError";
  }
}

export async function handleGenerateDemoLead(request: Request): Promise<Response> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonError("demo_not_configured", 503);
    }

    if (isProductionEnvironment() && !getTurnstileSecretKey()) {
      return jsonError("demo_not_configured", 503);
    }

    const rateLimitConfig = getRateLimitConfig();
    const supabase = createServerSupabaseClient();
    const clientIp = getTrustedClientIp(request);
    const bucketKey = hashClientIdentifier(clientIp, rateLimitConfig.secret);
    const rateLimit = await checkDemoRateLimit(supabase, bucketKey, rateLimitConfig);

    if (!rateLimit.allowed) {
      return jsonError("rate_limited", 429, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }

    const rawBody = await readRequestBody(request);

    let parsedBody: unknown;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      throw new InvalidJsonError();
    }

    const payload = generateLeadRequestSchema.parse(parsedBody);
    await verifyTurnstileToken(payload.turnstileToken, clientIp);

    const demoResetGroupId = randomUUID();
    const draft = buildSyntheticLeadDraft(payload.locale, demoResetGroupId);
    const lead = await insertSyntheticLead(supabase, draft.insert);
    const summary: DemoLeadSummary = toDemoLeadSummary(lead, draft.personaLabel);

    logger.info(LOG_SCOPE, "Synthetic demo lead generated", {
      id: summary.id,
      locale: summary.locale,
      priority: summary.priority,
      demoResetGroupId,
    });

    return jsonResponse({ lead: summary }, 201);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return jsonError("body_too_large", 413);
    }

    if (error instanceof InvalidJsonError) {
      return jsonError("invalid_json", 400);
    }

    if (error instanceof ZodError) {
      return jsonError("invalid_payload", 400);
    }

    if (error instanceof TurnstileVerificationError) {
      return jsonError("turnstile_failed", 403);
    }

    if (
      error instanceof SupabaseServerConfigError ||
      error instanceof RateLimitConfigError ||
      error instanceof TurnstileConfigError
    ) {
      logger.error(LOG_SCOPE, "Demo lead generation configuration error", {
        error: error.name,
      });
      return jsonError("demo_not_configured", 503);
    }

    logger.error(LOG_SCOPE, "Demo lead generation failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });

    return jsonError("generation_failed", 500);
  }
}
