import type { NextResponse } from "next/server";

import { LOCALE_COOKIE_NAME } from "@/i18n/config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function copyResponseCookies(source: NextResponse, target: NextResponse): NextResponse {
  if (source === target) {
    return target;
  }

  for (const header of source.headers.getSetCookie()) {
    target.headers.append("set-cookie", header);
  }

  return target;
}

export function withLocaleCookie(response: NextResponse, locale: string): NextResponse {
  response.headers.append(
    "set-cookie",
    `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`,
  );

  return response;
}

export function finalizeProxyResponse(
  authSource: NextResponse,
  target: NextResponse,
  locale?: string,
): NextResponse {
  const response = copyResponseCookies(authSource, target);

  if (locale) {
    return withLocaleCookie(response, locale);
  }

  return response;
}
