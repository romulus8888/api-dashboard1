import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";

import { LOCALE_COOKIE_NAME } from "@/i18n/config";
import { copyResponseCookies, finalizeProxyResponse } from "@/lib/supabase/copy-proxy-cookies";

function createAuthSourceWithRotatedAndDeletedCookies(): NextResponse {
  const authSource = NextResponse.next();

  authSource.cookies.set("sb-access-token", "rotated-access-token", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 3600,
  });

  authSource.cookies.set("sb-refresh-token", "", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
  });

  return authSource;
}

function expectLocaleCookie(target: NextResponse, locale: string) {
  expect(
    target.headers
      .getSetCookie()
      .some((header) => header.startsWith(`${LOCALE_COOKIE_NAME}=${locale}`)),
  ).toBe(true);
}

function expectAuthCookies(target: NextResponse) {
  const cookies = target.headers.getSetCookie();

  expect(cookies.some((header) => header.includes("sb-access-token=rotated-access-token"))).toBe(
    true,
  );
  expect(
    cookies.some(
      (header) => header.includes("sb-refresh-token=") && header.toLowerCase().includes("max-age=0"),
    ),
  ).toBe(true);
}

describe("copy-proxy-cookies", () => {
  it("copies rotated and deleted Supabase cookies onto a different response", () => {
    const authSource = createAuthSourceWithRotatedAndDeletedCookies();
    const target = NextResponse.redirect("http://localhost/en/login");

    const result = copyResponseCookies(authSource, target);

    expect(result).toBe(target);
    expectAuthCookies(result);
  });

  it("does not duplicate cookies when source and target are the same response", () => {
    const authSource = createAuthSourceWithRotatedAndDeletedCookies();
    const before = authSource.headers.getSetCookie().length;

    const result = copyResponseCookies(authSource, authSource);

    expect(result).toBe(authSource);
    expect(result.headers.getSetCookie().length).toBe(before);
    expectAuthCookies(result);
  });

  it("applies the locale cookie after copying auth cookies", () => {
    const authSource = createAuthSourceWithRotatedAndDeletedCookies();
    const target = NextResponse.next();

    const result = finalizeProxyResponse(authSource, target, "ru");

    expectAuthCookies(result);
    expectLocaleCookie(result, "ru");
  });

  it("preserves auth cookies on locale redirects", () => {
    const authSource = createAuthSourceWithRotatedAndDeletedCookies();
    const redirect = NextResponse.redirect("http://localhost/ru/dashboard");

    const result = finalizeProxyResponse(authSource, redirect, "ru");

    expect(getRedirectUrl(result)).toBe("http://localhost/ru/dashboard");
    expectAuthCookies(result);
    expectLocaleCookie(result, "ru");
  });
});

function getRedirectUrl(response: NextResponse): string | null {
  return response.headers.get("location");
}
