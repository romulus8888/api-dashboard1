import { handleListOperators } from "@/lib/admin/handlers/list-operators";

export async function GET(): Promise<Response> {
  return handleListOperators();
}
