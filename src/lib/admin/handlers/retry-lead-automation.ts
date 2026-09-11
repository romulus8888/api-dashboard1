import { z, ZodError } from "zod";

import { adminInternalError, adminJsonError, adminJsonResponse } from "@/lib/admin/api-response";
import { ADMIN_LEAD_DETAIL_COLUMNS } from "@/lib/admin/lead-columns";
import { logAdminError } from "@/lib/admin/safe-log";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { AuthError, CsrfError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const LOG_SCOPE = "admin-retry-lead-automation";
const MAX_BODY_BYTES = 256;
const leadIdSchema = z.uuid();
const retryBodySchema = z.object({}).strict();

export async function handleRetryLeadAutomation(
  leadId: string,
  request: Request,
): Promise<Response> {
  try {
    assertSameOriginMutation(request);

    const { operator } = await requireActiveOperator();

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return adminJsonError("Request body exceeds the 256 byte limit.", 413);
    }

    if (rawBody.trim().length > 0) {
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        return adminJsonError("Request body must be valid JSON.", 400);
      }

      retryBodySchema.parse(parsedBody);
    }

    const parsedLeadId = leadIdSchema.parse(leadId);
    const service = createServiceSupabaseClient();

    const { data: retriedLead, error: retryError } = await service.rpc(
      "retry_lead_automation",
      {
        p_lead_id: parsedLeadId,
        p_changed_by: operator.id,
      },
    );

    if (retryError) {
      if (retryError.message.includes("not found")) {
        return adminJsonError("Lead not found.", 404);
      }

      if (
        retryError.message.includes("not in failed automation_state")
        || retryError.message.includes("stale automation_state=processing")
      ) {
        return adminJsonError("Lead automation cannot be retried in its current state.", 409);
      }

      logAdminError(LOG_SCOPE, "Lead automation retry failed", retryError);
      return adminInternalError();
    }

    const { data, error: fetchError } = await service
      .from("leads")
      .select(ADMIN_LEAD_DETAIL_COLUMNS)
      .eq("id", parsedLeadId)
      .maybeSingle();

    if (fetchError) {
      logAdminError(LOG_SCOPE, "Failed to fetch lead after automation retry", fetchError);
      return adminInternalError();
    }

    return adminJsonResponse({ data: data ?? retriedLead }, 200);
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

    logAdminError(LOG_SCOPE, "Unexpected automation retry failure", error);
    return adminInternalError();
  }
}
