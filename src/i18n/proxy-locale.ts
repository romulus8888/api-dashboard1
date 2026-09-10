import type { NextRequest } from "next/server";

import type { Locale } from "@/i18n/config";
import { isLocale, LOCALE_COOKIE_NAME } from "@/i18n/config";
import { negotiateLocale } from "@/i18n/negotiate-locale";

const STATIC_FILE_PATTERN = /\.[a-zA-Z0-9]+$/;

export function shouldSkipLocaleProxy(pathname: string): boolean {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    STATIC_FILE_PATTERN.test(pathname)
  );
}

export function getLocaleFromPath(pathname: string): Locale | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment && isLocale(segment) ? segment : null;
}

export function resolveNegotiatedLocale(request: NextRequest): Locale {
  return negotiateLocale({
    cookieValue: request.cookies.get(LOCALE_COOKIE_NAME)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
}

export function buildLocalizedPath(pathname: string, locale: Locale): string {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length > 0 && isLocale(segments[0])) {
    segments[0] = locale;
  } else {
    segments.unshift(locale);
  }

  return `/${segments.join("/")}`;
}
