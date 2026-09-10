import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isLocale, type Locale } from "@/i18n/config";
import {
  buildLocalizedPath,
  getLocaleFromPath,
  resolveNegotiatedLocale,
  shouldSkipLocaleProxy,
} from "@/i18n/proxy-locale";
import { finalizeProxyResponse } from "@/lib/supabase/copy-proxy-cookies";
import { createProxySupabaseSession } from "@/lib/supabase/proxy-client";

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

  const { client: supabase, getAuthResponse } = createProxySupabaseSession(request);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const pathLocale = getLocaleFromPath(pathname);

    if (pathLocale && isDashboardPath(pathname) && !user) {
      return finalizeProxyResponse(
        getAuthResponse(),
        buildLoginRedirect(request, pathLocale),
        pathLocale,
      );
    }
  }

  const pathLocale = getLocaleFromPath(pathname);
  if (pathLocale) {
    return finalizeProxyResponse(getAuthResponse(), getAuthResponse(), pathLocale);
  }

  const firstSegment = pathname.split("/").filter(Boolean)[0];
  if (firstSegment && firstSegment.length === 2 && !isLocale(firstSegment)) {
    return getAuthResponse();
  }

  const locale = resolveNegotiatedLocale(request);
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = buildLocalizedPath(pathname, locale);

  return finalizeProxyResponse(getAuthResponse(), NextResponse.redirect(redirectUrl), locale);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
