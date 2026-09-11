import { z, ZodError } from "zod";

import { adminInternalError, adminJsonError, adminJsonResponse } from "@/lib/admin/api-response";
import { leadCommentCreateSchema } from "@/lib/admin/lead-comment-schema";
import { logAdminError } from "@/lib/admin/safe-log";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { AuthError, CsrfError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const LOG_SCOPE = "admin-create-lead-comment";
const MAX_BODY_BYTES = 4096;
const leadIdSchema = z.uuid();

export async function handleCreateLeadComment(
  leadId: string,
  request: Request,
): Promise<Response> {
  try {
    assertSameOriginMutation(request);

    const { operator } = await requireActiveOperator();

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return adminJsonError("Request body exceeds the 4 KB limit.", 413);
    }

    let parsedBody: unknown;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return adminJsonError("Request body must be valid JSON.", 400);
    }

    const parsedLeadId = leadIdSchema.parse(leadId);
    const payload = leadCommentCreateSchema.parse(parsedBody);
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
      .insert({
        lead_id: parsedLeadId,
        author_id: operator.id,
        body: payload.body,
      })
      .select(
        "id, lead_id, author_id, body, created_at, updated_at, operator_profiles(display_name)",
      )
      .single();

    if (error) {
      if (error.message.includes("validate_active_operator_assignment")) {
        return adminJsonError("Comment author must be an active operator.", 403);
      }

      logAdminError(LOG_SCOPE, "Failed to create lead comment", error);
      return adminInternalError();
    }

    const row = data as {
      id: string;
      lead_id: string;
      author_id: string;
      body: string;
      created_at: string;
      updated_at: string;
      operator_profiles: { display_name: string } | null;
    };

    return adminJsonResponse(
      {
        data: {
          id: row.id,
          lead_id: row.lead_id,
          author_id: row.author_id,
          author_name: row.operator_profiles?.display_name ?? operator.display_name,
          body: row.body,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
      },
      201,
    );
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

    logAdminError(LOG_SCOPE, "Unexpected create lead comment failure", error);
    return adminInternalError();
  }
}
