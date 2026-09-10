import "server-only";

import { AuthError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";

export type DashboardAccessResult =
  | { kind: "authorized" }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" };

export async function getDashboardAccess(): Promise<DashboardAccessResult> {
  try {
    await requireActiveOperator();
    return { kind: "authorized" };
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.status === 401) {
        return { kind: "unauthenticated" };
      }

      if (error.status === 403) {
        return { kind: "forbidden" };
      }
    }

    throw error;
  }
}
