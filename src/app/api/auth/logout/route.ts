import { handleLogout } from "@/lib/auth/login-handler";

export async function POST() {
  return handleLogout();
}
