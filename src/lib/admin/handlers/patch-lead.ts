import { z, ZodError } from "zod";

import { adminInternalError, adminJsonError, adminJsonResponse } from "@/lib/admin/api-response";
import { ADMIN_LEAD_DETAIL_COLUMNS } from "@/lib/admin/lead-columns";
import { leadPatchSchema } from "@/lib/admin/lead-update-schema";
import { logAdminError } from "@/lib/admin/safe-log";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { AuthError, CsrfError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { LeadOperationalUpdate } from "@/types/lead";

const LOG_SCOPE = "admin-patch-lead";
const MAX_BODY_BYTES = 2048;
const leadIdSchema = z.uuid();

async function assertActiveOwner(ownerId: string | null | undefined) {
  if (ownerId === undefined || ownerId === null) {
    return;
  }

  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("operator_profiles")
    .select("id")
    .eq("id", ownerId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    logAdminError(LOG_SCOPE, "Failed to validate owner assignment", error);
    throw new Error("owner_validation_failed");
  }

  if (!data) {
    throw new z.ZodError([
      {
        code: "custom",
        message: "Owner must be an active operator.",
        path: ["owner_id"],
      },
    ]);
  }
}

export async function handlePatchLead(leadId: string, request: Request): Promise<Response> {
  try {
    assertSameOriginMutation(request);
    await requireActiveOperator();

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return adminJsonError("Request body exceeds the 2 KB limit.", 413);
    }

    let parsedBody: unknown;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return adminJsonError("Request body must be valid JSON.", 400);
    }

    const parsedLeadId = leadIdSchema.parse(leadId);
    const payload = leadPatchSchema.parse(parsedBody);

    await assertActiveOwner(payload.owner_id);

    const service = createServiceSupabaseClient();
    const updatePayload: LeadOperationalUpdate = {};

    if (payload.owner_id !== undefined) updatePayload.owner_id = payload.owner_id;
    if (payload.priority !== undefined) updatePayload.priority = payload.priority;
    if (payload.next_action_at !== undefined) updatePayload.next_action_at = payload.next_action_at;
    if (payload.first_response_due_at !== undefined) {
      updatePayload.first_response_due_at = payload.first_response_due_at;
    }

    let updateQuery = service.from("leads").update(updatePayload).eq("id", parsedLeadId);

    if (payload.updated_at) {
      updateQuery = updateQuery.eq("updated_at", payload.updated_at);
    }

    const { data, error } = await updateQuery.select(ADMIN_LEAD_DETAIL_COLUMNS).maybeSingle();

    if (error) {
      if (error.message.includes("validate_active_operator_assignment")) {
        return adminJsonError("Owner must be an active operator.", 400);
      }

      logAdminError(LOG_SCOPE, "Failed to patch lead", error);
      return adminInternalError();
    }

    if (!data) {
      if (payload.updated_at) {
        return adminJsonError("Lead was updated by another session.", 409);
      }

      return adminJsonError("Lead not found.", 404);
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

    if (error instanceof Error && error.message === "owner_validation_failed") {
      return adminInternalError();
    }

    logAdminError(LOG_SCOPE, "Unexpected patch lead failure", error);
    return adminInternalError();
  }
}
