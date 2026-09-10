import { handleLogin } from "@/lib/auth/login-handler";

export async function POST(request: Request) {
  return handleLogin(request);
}
