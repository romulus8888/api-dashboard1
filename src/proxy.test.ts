import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRedirectUrl } from "next/experimental/testing/server";

import { LOCALE_COOKIE_NAME } from "@/i18n/config";
import { shouldSkipLocaleProxy } from "@/i18n/proxy-locale";
import { proxy } from "@/proxy";

describe("proxy", () => {
  it("does not redirect API routes", () => {
    expect(shouldSkipLocaleProxy("/api/demo/generate-lead")).toBe(true);
  });

  it("redirects the root path using the locale cookie", async () => {
    const request = new NextRequest("http://localhost/", {
      headers: {
        cookie: `${LOCALE_COOKIE_NAME}=ru`,
      },
    });

    const response = await proxy(request);
    expect(getRedirectUrl(response)).toBe("http://localhost/ru");
    expect(response.cookies.get(LOCALE_COOKIE_NAME)?.value).toBe("ru");
  });

  it("redirects unprefixed pages using Accept-Language", async () => {
    const request = new NextRequest("http://localhost/dashboard", {
      headers: {
        "accept-language": "ru-RU,ru;q=0.9",
      },
    });

    const response = await proxy(request);
    expect(getRedirectUrl(response)).toBe("http://localhost/ru/dashboard");
  });

  it("falls back to English and persists the locale cookie", async () => {
    const request = new NextRequest("http://localhost/dashboard");

    const response = await proxy(request);
    expect(getRedirectUrl(response)).toBe("http://localhost/en/dashboard");
    expect(response.cookies.get(LOCALE_COOKIE_NAME)?.value).toBe("en");
  });

  it("does not rewrite invalid locale prefixes", async () => {
    const request = new NextRequest("http://localhost/fr");
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("passes through prefixed locale routes", async () => {
    const request = new NextRequest("http://localhost/en/dashboard");
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get(LOCALE_COOKIE_NAME)?.value).toBe("en");
  });
});
