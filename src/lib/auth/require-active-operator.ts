import "server-only";

import { createAuthServerClient } from "@/lib/supabase/auth";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { AuthError } from "@/lib/auth/errors";
import type { OperatorProfile } from "@/types/lead";

export interface ActiveOperatorContext {
  userId: string;
  operator: Pick<OperatorProfile, "id" | "display_name" | "is_active">;
}

export async function requireActiveOperator(): Promise<ActiveOperatorContext> {
  const authClient = await createAuthServerClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    throw new AuthError(401, "Unauthorized");
  }

  const serviceClient = createServiceSupabaseClient();
  const { data: operator, error: operatorError } = await serviceClient
    .from("operator_profiles")
    .select("id, display_name, is_active")
    .eq("id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (operatorError || !operator) {
    throw new AuthError(403, "Forbidden");
  }

  return {
    userId: user.id,
    operator,
  };
}
