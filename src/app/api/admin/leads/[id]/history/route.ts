import { handleGetLeadHistory } from "@/lib/admin/handlers/get-lead-history";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return handleGetLeadHistory(id);
}
