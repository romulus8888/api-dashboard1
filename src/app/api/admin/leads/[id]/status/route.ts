import { handleTransitionLeadStatus } from "@/lib/admin/handlers/transition-lead-status";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return handleTransitionLeadStatus(id, request);
}
