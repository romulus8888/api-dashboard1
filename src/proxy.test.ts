import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { getRedirectUrl } from "next/experimental/testing/server";

import { LOCALE_COOKIE_NAME } from "@/i18n/config";
import { shouldSkipLocaleProxy } from "@/i18n/proxy-locale";
import { proxy } from "@/proxy";
import { createProxySupabaseSession } from "@/lib/supabase/proxy-client";

vi.mock("@/lib/supabase/proxy-client", () => ({
  createProxySupabaseSession: vi.fn(),
}));

const SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

function applySupabaseAuthCookies(response: NextResponse) {
  response.cookies.set("sb-access-token", "rotated-access-token", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 3600,
  });

  response.cookies.set("sb-refresh-token", "", {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
  });
}

function expectLocaleCookie(response: NextResponse, locale: string) {
  expect(
    response.headers
      .getSetCookie()
      .some((header) => header.startsWith(`${LOCALE_COOKIE_NAME}=${locale}`)),
  ).toBe(true);
}

function expectSupabaseAuthCookies(response: NextResponse) {
  const cookies = response.headers.getSetCookie();

  expect(cookies.some((header) => header.includes("sb-access-token=rotated-access-token"))).toBe(
    true,
  );
  expect(
    cookies.some(
      (header) => header.includes("sb-refresh-token=") && header.toLowerCase().includes("max-age=0"),
    ),
  ).toBe(true);
}

function mockSupabaseSession(
  request: NextRequest,
  options: { user: { id: string } | null },
) {
  const authResponse = NextResponse.next({ request });
  applySupabaseAuthCookies(authResponse);

  vi.mocked(createProxySupabaseSession).mockReturnValue({
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: options.user } }),
      },
    } as never,
    getAuthResponse: () => authResponse,
  });
}

describe("proxy", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_ENV.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SUPABASE_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    vi.mocked(createProxySupabaseSession).mockReset();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("does not redirect API routes", () => {
    expect(shouldSkipLocaleProxy("/api/demo/generate-lead")).toBe(true);
  });

  it("redirects the root path using the locale cookie", async () => {
    const request = new NextRequest("http://localhost/", {
      headers: {
        cookie: `${LOCALE_COOKIE_NAME}=ru`,
      },
    });

    mockSupabaseSession(request, { user: null });

    const response = await proxy(request);
    expect(getRedirectUrl(response)).toBe("http://localhost/ru");
    expectLocaleCookie(response, "ru");
    expectSupabaseAuthCookies(response);
  });

  it("redirects unprefixed pages using Accept-Language", async () => {
    const request = new NextRequest("http://localhost/dashboard", {
      headers: {
        "accept-language": "ru-RU,ru;q=0.9",
      },
    });

    mockSupabaseSession(request, { user: null });

    const response = await proxy(request);
    expect(getRedirectUrl(response)).toBe("http://localhost/ru/dashboard");
    expectSupabaseAuthCookies(response);
  });

  it("falls back to English and persists the locale cookie", async () => {
    const request = new NextRequest("http://localhost/dashboard");

    mockSupabaseSession(request, { user: null });

    const response = await proxy(request);
    expect(getRedirectUrl(response)).toBe("http://localhost/en/dashboard");
    expectLocaleCookie(response, "en");
    expectSupabaseAuthCookies(response);
  });

  it("does not rewrite invalid locale prefixes", async () => {
    const request = new NextRequest("http://localhost/fr");
    mockSupabaseSession(request, { user: null });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expectSupabaseAuthCookies(response);
  });

  it("passes through prefixed locale routes and preserves refreshed auth cookies", async () => {
    const request = new NextRequest("http://localhost/en/dashboard");
    mockSupabaseSession(request, { user: { id: "operator-1" } });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expectLocaleCookie(response, "en");
    expectSupabaseAuthCookies(response);
  });

  it("redirects unauthenticated dashboard requests to login with auth cookies preserved", async () => {
    const request = new NextRequest("http://localhost/en/dashboard");
    mockSupabaseSession(request, { user: null });

    const response = await proxy(request);

    expect(getRedirectUrl(response)).toBe(
      "http://localhost/en/login?returnTo=%2Fen%2Fdashboard",
    );
    expectLocaleCookie(response, "en");
    expectSupabaseAuthCookies(response);
  });
});
