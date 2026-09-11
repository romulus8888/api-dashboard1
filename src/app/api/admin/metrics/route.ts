import { handleGetLeadMetrics } from "@/lib/admin/handlers/get-lead-metrics";

export async function GET(request: Request) {
  return handleGetLeadMetrics(request);
}
