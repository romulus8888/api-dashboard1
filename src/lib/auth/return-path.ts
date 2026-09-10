import type { Locale } from "@/i18n/config";
import { isLocale } from "@/i18n/config";

const INTERNAL_PATH_PATTERN = /^\/(en|ru)(\/[A-Za-z0-9._~!$&'()*+,;=:@%-]*)?$/;

export function validateReturnPath(path: string | null | undefined, locale: Locale): string {
  const fallback = `/${locale}/dashboard`;

  if (!path) {
    return fallback;
  }

  const trimmed = path.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
    return fallback;
  }

  const pathname = trimmed.split("?")[0]?.split("#")[0] ?? "";

  if (!INTERNAL_PATH_PATTERN.test(pathname)) {
    return fallback;
  }

  const pathLocale = pathname.split("/").filter(Boolean)[0];

  if (!pathLocale || !isLocale(pathLocale) || pathLocale !== locale) {
    return fallback;
  }

  if (pathname === `/${locale}/login`) {
    return fallback;
  }

  return pathname;
}
