import { z } from "zod";

import { adminInternalError, adminJsonError, adminJsonResponse } from "@/lib/admin/api-response";
import { ADMIN_LEAD_DETAIL_COLUMNS } from "@/lib/admin/lead-columns";
import { logAdminError } from "@/lib/admin/safe-log";
import { AuthError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const LOG_SCOPE = "admin-get-lead";

const leadIdSchema = z.uuid();

export async function handleGetLead(leadId: string): Promise<Response> {
  try {
    await requireActiveOperator();

    const parsedLeadId = leadIdSchema.parse(leadId);
    const service = createServiceSupabaseClient();
    const { data, error } = await service
      .from("leads")
      .select(ADMIN_LEAD_DETAIL_COLUMNS)
      .eq("id", parsedLeadId)
      .maybeSingle();

    if (error) {
      logAdminError(LOG_SCOPE, "Failed to fetch lead", error);
      return adminInternalError();
    }

    if (!data) {
      return adminJsonError("Lead not found.", 404);
    }

    return adminJsonResponse({ data }, 200);
  } catch (error) {
    if (error instanceof AuthError) {
      return adminJsonError(error.message, error.status);
    }

    if (error instanceof z.ZodError) {
      return adminJsonError("Invalid lead id.", 400);
    }

    logAdminError(LOG_SCOPE, "Unexpected get lead failure", error);
    return adminInternalError();
  }
}
