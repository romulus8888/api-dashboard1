import { handleGetLead } from "@/lib/admin/handlers/get-lead";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return handleGetLead(id);
}
