import { z, ZodError } from "zod";

import { createAuthServerClient, SupabaseAuthConfigError } from "@/lib/supabase/auth";
import { logger } from "@/lib/logger";

const LOG_SCOPE = "auth-login";

const loginSchema = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(1).max(256),
  })
  .strict();

export type LoginErrorCode = "invalid_credentials" | "invalid_payload" | "auth_not_configured";

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function jsonError(code: LoginErrorCode, status: number): Response {
  return jsonResponse({ error: code }, status);
}

export async function handleLogin(request: Request): Promise<Response> {
  try {
    let parsedBody: unknown;

    try {
      parsedBody = await request.json();
    } catch {
      return jsonError("invalid_payload", 400);
    }

    const payload = loginSchema.parse(parsedBody);
    const supabase = await createAuthServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    });

    if (error) {
      logger.error(LOG_SCOPE, "Sign-in rejected", { name: error.name });
      return jsonError("invalid_credentials", 401);
    }

    return jsonResponse({ ok: true }, 200);
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError("invalid_payload", 400);
    }

    if (error instanceof SupabaseAuthConfigError) {
      return jsonError("auth_not_configured", 503);
    }

    logger.error(LOG_SCOPE, "Unexpected login failure", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonError("invalid_credentials", 401);
  }
}

export async function handleLogout(): Promise<Response> {
  try {
    const supabase = await createAuthServerClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      logger.error(LOG_SCOPE, "Sign-out failed", { name: error.name });
      return jsonResponse({ error: "logout_failed" }, 500);
    }

    return jsonResponse({ ok: true }, 200);
  } catch (error) {
    if (error instanceof SupabaseAuthConfigError) {
      return jsonResponse({ error: "auth_not_configured" }, 503);
    }

    logger.error(LOG_SCOPE, "Unexpected logout failure", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonResponse({ error: "logout_failed" }, 500);
  }
}
