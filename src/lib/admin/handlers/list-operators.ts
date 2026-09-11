import { adminInternalError, adminJsonError, adminJsonResponse } from "@/lib/admin/api-response";
import { logAdminError } from "@/lib/admin/safe-log";
import { AuthError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const LOG_SCOPE = "admin-list-operators";

export async function handleListOperators(): Promise<Response> {
  try {
    await requireActiveOperator();

    const service = createServiceSupabaseClient();
    const { data, error } = await service
      .from("operator_profiles")
      .select("id, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true });

    if (error) {
      logAdminError(LOG_SCOPE, "Failed to list active operators", error);
      return adminInternalError();
    }

    return adminJsonResponse({ data: data ?? [] }, 200);
  } catch (error) {
    if (error instanceof AuthError) {
      return adminJsonError(error.message, error.status);
    }

    logAdminError(LOG_SCOPE, "Unexpected list operators failure", error);
    return adminInternalError();
  }
}
