import { handleResetDemoData } from "@/lib/admin/handlers/reset-demo-data";

export async function POST(request: Request): Promise<Response> {
  return handleResetDemoData(request);
}
