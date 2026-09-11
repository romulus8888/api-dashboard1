import { handleCreateLeadComment } from "@/lib/admin/handlers/create-lead-comment";
import { handleListLeadComments } from "@/lib/admin/handlers/list-lead-comments";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return handleListLeadComments(id);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return handleCreateLeadComment(id, request);
}
