import { handleListLeads } from "@/lib/admin/handlers/list-leads";

export async function GET(request: Request): Promise<Response> {
  return handleListLeads(request);
}
