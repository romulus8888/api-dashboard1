import { handleGenerateDemoLead } from "@/lib/demo/generate-lead-handler";

export async function POST(request: Request): Promise<Response> {
  return handleGenerateDemoLead(request);
}
