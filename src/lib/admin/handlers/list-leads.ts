import { ZodError } from "zod";

import { adminInternalError, adminJsonError, adminJsonResponse } from "@/lib/admin/api-response";
import { ADMIN_LEAD_LIST_COLUMNS } from "@/lib/admin/lead-columns";
import { parseLeadsListQuery } from "@/lib/admin/leads-list-query";
import { logAdminError } from "@/lib/admin/safe-log";
import { AuthError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const LOG_SCOPE = "admin-list-leads";

export async function handleListLeads(request: Request): Promise<Response> {
  try {
    await requireActiveOperator();

    const query = parseLeadsListQuery(new URL(request.url).searchParams);
    const service = createServiceSupabaseClient();
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let builder = service.from("leads").select(ADMIN_LEAD_LIST_COLUMNS, { count: "exact" });

    if (query.status) builder = builder.eq("status", query.status);
    if (query.priority) builder = builder.eq("priority", query.priority);
    if (query.source) builder = builder.eq("source", query.source);
    if (query.locale) builder = builder.eq("locale", query.locale);
    if (query.isSynthetic !== undefined) builder = builder.eq("is_synthetic", query.isSynthetic);

    const { data, error, count } = await builder
      .order(query.sortBy, { ascending: query.sortDir === "asc" })
      .range(from, to);

    if (error) {
      logAdminError(LOG_SCOPE, "Failed to list leads", error);
      return adminInternalError();
    }

    const total = count ?? 0;

    return adminJsonResponse(
      {
        data,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
        },
      },
      200,
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return adminJsonError(error.message, error.status);
    }

    if (error instanceof ZodError) {
      return adminJsonError("Invalid query parameters.", 400);
    }

    logAdminError(LOG_SCOPE, "Unexpected list leads failure", error);
    return adminInternalError();
  }
}
