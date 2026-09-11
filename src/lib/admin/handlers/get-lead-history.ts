import { z } from "zod";

import { adminInternalError, adminJsonError, adminJsonResponse } from "@/lib/admin/api-response";
import { logAdminError } from "@/lib/admin/safe-log";
import { AuthError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { LeadStatusHistoryEntry } from "@/types/lead";

const LOG_SCOPE = "admin-get-lead-history";
const leadIdSchema = z.uuid();

type HistoryRow = {
  id: string;
  lead_id: string;
  from_status: LeadStatusHistoryEntry["from_status"];
  to_status: LeadStatusHistoryEntry["to_status"];
  changed_by: string | null;
  change_source: string;
  reason: string | null;
  created_at: string;
  operator_profiles: { display_name: string } | null;
};

export async function handleGetLeadHistory(leadId: string): Promise<Response> {
  try {
    await requireActiveOperator();

    const parsedLeadId = leadIdSchema.parse(leadId);
    const service = createServiceSupabaseClient();

    const { data: lead, error: leadError } = await service
      .from("leads")
      .select("id")
      .eq("id", parsedLeadId)
      .maybeSingle();

    if (leadError) {
      logAdminError(LOG_SCOPE, "Failed to verify lead", leadError);
      return adminInternalError();
    }

    if (!lead) {
      return adminJsonError("Lead not found.", 404);
    }

    const { data, error } = await service
      .from("lead_status_history")
      .select(
        "id, lead_id, from_status, to_status, changed_by, change_source, reason, created_at, operator_profiles(display_name)",
      )
      .eq("lead_id", parsedLeadId)
      .order("created_at", { ascending: false });

    if (error) {
      logAdminError(LOG_SCOPE, "Failed to fetch lead history", error);
      return adminInternalError();
    }

    const history = ((data ?? []) as HistoryRow[]).map((entry) => ({
      id: entry.id,
      lead_id: entry.lead_id,
      from_status: entry.from_status,
      to_status: entry.to_status,
      changed_by: entry.changed_by,
      changed_by_name: entry.operator_profiles?.display_name ?? null,
      change_source: entry.change_source,
      reason: entry.reason,
      created_at: entry.created_at,
    })) satisfies LeadStatusHistoryEntry[];

    return adminJsonResponse({ data: history }, 200);
  } catch (error) {
    if (error instanceof AuthError) {
      return adminJsonError(error.message, error.status);
    }

    if (error instanceof z.ZodError) {
      return adminJsonError("Invalid lead id.", 400);
    }

    logAdminError(LOG_SCOPE, "Unexpected get lead history failure", error);
    return adminInternalError();
  }
}
