import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isLocale, LOCALE_COOKIE_NAME, type Locale } from "@/i18n/config";
import {
  buildLocalizedPath,
  getLocaleFromPath,
  resolveNegotiatedLocale,
  shouldSkipLocaleProxy,
} from "@/i18n/proxy-locale";
import { createProxySupabaseClient } from "@/lib/supabase/proxy-client";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function withLocaleCookie(response: NextResponse, locale: string): NextResponse {
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });

  return response;
}

function isDashboardPath(pathname: string): boolean {
  return /^\/(en|ru)\/dashboard\/?$/.test(pathname);
}

function buildLoginRedirect(request: NextRequest, locale: Locale): NextResponse {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = `/${locale}/login`;
  loginUrl.searchParams.set("returnTo", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldSkipLocaleProxy(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next({ request });
  const supabase = createProxySupabaseClient(request, response);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const pathLocale = getLocaleFromPath(pathname);

    if (pathLocale && isDashboardPath(pathname) && !user) {
      return withLocaleCookie(buildLoginRedirect(request, pathLocale), pathLocale);
    }
  }

  if (getLocaleFromPath(pathname)) {
    const pathLocale = getLocaleFromPath(pathname);
    if (pathLocale) {
      return withLocaleCookie(response, pathLocale);
    }
  }

  const firstSegment = pathname.split("/").filter(Boolean)[0];
  if (firstSegment && firstSegment.length === 2 && !isLocale(firstSegment)) {
    return response;
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
