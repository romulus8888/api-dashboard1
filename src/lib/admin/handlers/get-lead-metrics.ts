import { ZodError } from "zod";

import { adminInternalError, adminJsonError, adminJsonResponse } from "@/lib/admin/api-response";
import {
  metricsQuerySchema,
  resolveMetricsRange,
} from "@/lib/admin/metrics-query-schema";
import { logAdminError } from "@/lib/admin/safe-log";
import { AuthError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { LeadMetrics } from "@/types/metrics";

const LOG_SCOPE = "admin-get-lead-metrics";

export async function handleGetLeadMetrics(request: Request): Promise<Response> {
  try {
    await requireActiveOperator();

    const url = new URL(request.url);
    const payload = metricsQuerySchema.parse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });

    const { from, to } = resolveMetricsRange(payload);
    const service = createServiceSupabaseClient();

    const { data, error } = await service.rpc("get_lead_metrics", {
      p_from: from,
      p_to: to,
      p_as_of: new Date().toISOString(),
    });

    if (error) {
      logAdminError(LOG_SCOPE, "Failed to fetch lead metrics", error);
      return adminInternalError();
    }

    return adminJsonResponse({ data: data as unknown as LeadMetrics }, 200);
  } catch (error) {
    if (error instanceof AuthError) {
      return adminJsonError(error.message, error.status);
    }

    if (error instanceof ZodError) {
      return adminJsonError("Invalid metrics query parameters.", 400);
    }

    logAdminError(LOG_SCOPE, "Unexpected get lead metrics failure", error);
    return adminInternalError();
  }
}
