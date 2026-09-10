import { logger } from "@/lib/logger";

const SENSITIVE_PATTERNS = [/service_role/i, /supabase_service_role_key/i];

function containsSensitiveText(value: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

export function logAdminError(scope: string, message: string, error: unknown): void {
  const metadata: Record<string, unknown> = {};

  if (error instanceof Error) {
    metadata.name = error.name;
    if (!containsSensitiveText(error.message)) {
      metadata.message = error.message;
    }
  }

  logger.error(scope, message, metadata);
}
