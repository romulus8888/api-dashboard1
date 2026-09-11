import { z } from "zod";

import { adminInternalError, adminJsonError, adminJsonResponse } from "@/lib/admin/api-response";
import { logAdminError } from "@/lib/admin/safe-log";
import { AuthError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { LeadComment } from "@/types/lead";

const LOG_SCOPE = "admin-list-lead-comments";
const leadIdSchema = z.uuid();

type CommentRow = {
  id: string;
  lead_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  operator_profiles: { display_name: string } | null;
};

export async function handleListLeadComments(leadId: string): Promise<Response> {
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
      .from("lead_comments")
      .select(
        "id, lead_id, author_id, body, created_at, updated_at, operator_profiles(display_name)",
      )
      .eq("lead_id", parsedLeadId)
      .order("created_at", { ascending: true });

    if (error) {
      logAdminError(LOG_SCOPE, "Failed to list lead comments", error);
      return adminInternalError();
    }

    const comments = ((data ?? []) as CommentRow[]).map((comment) => ({
      id: comment.id,
      lead_id: comment.lead_id,
      author_id: comment.author_id,
      author_name: comment.operator_profiles?.display_name ?? "Unknown operator",
      body: comment.body,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
    })) satisfies LeadComment[];

    return adminJsonResponse({ data: comments }, 200);
  } catch (error) {
    if (error instanceof AuthError) {
      return adminJsonError(error.message, error.status);
    }

    if (error instanceof z.ZodError) {
      return adminJsonError("Invalid lead id.", 400);
    }

    logAdminError(LOG_SCOPE, "Unexpected list lead comments failure", error);
    return adminInternalError();
  }
}
