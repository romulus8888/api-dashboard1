import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isLocale, LOCALE_COOKIE_NAME } from "@/i18n/config";
import {
  buildLocalizedPath,
  getLocaleFromPath,
  resolveNegotiatedLocale,
  shouldSkipLocaleProxy,
} from "@/i18n/proxy-locale";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function withLocaleCookie(response: NextResponse, locale: string): NextResponse {
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });

  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldSkipLocaleProxy(pathname)) {
    return NextResponse.next();
  }

  const pathLocale = getLocaleFromPath(pathname);

  if (pathLocale) {
    return withLocaleCookie(NextResponse.next(), pathLocale);
  }

  const firstSegment = pathname.split("/").filter(Boolean)[0];
  if (firstSegment && firstSegment.length === 2 && !isLocale(firstSegment)) {
    return NextResponse.next();
  }

  const locale = resolveNegotiatedLocale(request);
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = buildLocalizedPath(pathname, locale);

  return withLocaleCookie(NextResponse.redirect(redirectUrl), locale);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
