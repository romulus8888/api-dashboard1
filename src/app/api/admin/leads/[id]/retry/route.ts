import { handleRetryLeadAutomation } from "@/lib/admin/handlers/retry-lead-automation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return handleRetryLeadAutomation(id, request);
}
