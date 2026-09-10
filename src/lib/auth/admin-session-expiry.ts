import type { Locale } from "@/i18n/config";
import { AdminLeadsApiError } from "@/lib/admin/admin-leads-client";
import { validateReturnPath } from "@/lib/auth/return-path";

export function isAdminSessionExpired(error: unknown): boolean {
  return error instanceof AdminLeadsApiError && error.code === "session_expired";
}

export function buildAdminLoginPath(locale: Locale, returnPath?: string): string {
  const validatedReturnTo = validateReturnPath(returnPath ?? `/${locale}/dashboard`, locale);
  return `/${locale}/login?returnTo=${encodeURIComponent(validatedReturnTo)}`;
}
