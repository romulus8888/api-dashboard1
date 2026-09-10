import { z, ZodError } from "zod";

import { adminInternalError, adminJsonError, adminJsonResponse } from "@/lib/admin/api-response";
import { ADMIN_LEAD_DETAIL_COLUMNS } from "@/lib/admin/lead-columns";
import { leadStatusTransitionSchema } from "@/lib/admin/lead-status-schema";
import { logAdminError } from "@/lib/admin/safe-log";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { AuthError, CsrfError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const LOG_SCOPE = "admin-transition-lead-status";
const MAX_BODY_BYTES = 1024;
const leadIdSchema = z.uuid();

export async function handleTransitionLeadStatus(
  leadId: string,
  request: Request,
): Promise<Response> {
  try {
    assertSameOriginMutation(request);

    const { operator } = await requireActiveOperator();

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return adminJsonError("Request body exceeds the 1 KB limit.", 413);
    }

    let parsedBody: unknown;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return adminJsonError("Request body must be valid JSON.", 400);
    }

    const parsedLeadId = leadIdSchema.parse(leadId);
    const payload = leadStatusTransitionSchema.parse(parsedBody);
    const service = createServiceSupabaseClient();

    const { data: transitionedLead, error: transitionError } = await service.rpc(
      "transition_lead_status",
      {
        p_lead_id: parsedLeadId,
        p_to_status: payload.status,
        p_change_source: "admin_api",
        p_changed_by: operator.id,
        p_reason: payload.reason ?? null,
      },
    );

    if (transitionError) {
      if (transitionError.message.includes("not found")) {
        return adminJsonError("Lead not found.", 404);
      }

      logAdminError(LOG_SCOPE, "Lead status transition failed", transitionError);
      return adminInternalError();
    }

    if (payload.status === "lost" && payload.reason) {
      const { error: lossReasonError } = await service
        .from("leads")
        .update({ loss_reason: payload.reason })
        .eq("id", parsedLeadId);

      if (lossReasonError) {
        logAdminError(LOG_SCOPE, "Failed to persist loss reason", lossReasonError);
        return adminInternalError();
      }
    }

    const { data, error: fetchError } = await service
      .from("leads")
      .select(ADMIN_LEAD_DETAIL_COLUMNS)
      .eq("id", parsedLeadId)
      .maybeSingle();

    if (fetchError) {
      logAdminError(LOG_SCOPE, "Failed to fetch lead after transition", fetchError);
      return adminInternalError();
    }

    return adminJsonResponse({ data: data ?? transitionedLead }, 200);
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

    logAdminError(LOG_SCOPE, "Unexpected status transition failure", error);
    return adminInternalError();
  }
}
