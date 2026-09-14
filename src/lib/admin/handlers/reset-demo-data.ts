import { ZodError } from "zod";

import { adminInternalError, adminJsonError, adminJsonResponse } from "@/lib/admin/api-response";
import { demoResetSchema } from "@/lib/admin/demo-reset-schema";
import { logAdminError } from "@/lib/admin/safe-log";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { AuthError, CsrfError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const LOG_SCOPE = "admin-reset-demo-data";
const MAX_BODY_BYTES = 256;

export async function handleResetDemoData(request: Request): Promise<Response> {
  try {
    assertSameOriginMutation(request);

    const { operator } = await requireActiveOperator();

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return adminJsonError("Request body exceeds the 256 byte limit.", 413);
    }

    let parsedBody: unknown;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return adminJsonError("Request body must be valid JSON.", 400);
    }

    demoResetSchema.parse(parsedBody);

    const service = createServiceSupabaseClient();
    const { data, error } = await service.rpc("reset_demo_data", {
      p_operator_id: operator.id,
    });

    if (error) {
      if (error.message.includes("not an active operator")) {
        return adminJsonError("Operator is not active.", 403);
      }

      if (error.message.includes("another reset is already in progress")) {
        return adminJsonError("Another demo reset is already running.", 409);
      }

      logAdminError(LOG_SCOPE, "Demo reset RPC failed", error);
      return adminInternalError();
    }

    return adminJsonResponse({ data }, 200);
  } catch (error) {
    if (error instanceof AuthError) {
      return adminJsonError(error.message, error.status);
    }

    if (error instanceof CsrfError) {
      return adminJsonError(error.message, 403);
    }

    if (error instanceof ZodError) {
      return adminJsonError("Invalid request payload.", 400);
    }

    logAdminError(LOG_SCOPE, "Unexpected demo reset failure", error);
    return adminInternalError();
  }
}
