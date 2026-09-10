import { describe, expect, it } from "vitest";

import {
  buildLocalizedPath,
  getLocaleFromPath,
  shouldSkipLocaleProxy,
} from "@/i18n/proxy-locale";

describe("proxy locale helpers", () => {
  it("skips API and static paths", () => {
    expect(shouldSkipLocaleProxy("/api/demo/generate-lead")).toBe(true);
    expect(shouldSkipLocaleProxy("/_next/static/chunk.js")).toBe(true);
    expect(shouldSkipLocaleProxy("/favicon.ico")).toBe(true);
    expect(shouldSkipLocaleProxy("/en/dashboard")).toBe(false);
  });

  it("reads locale prefixes from paths", () => {
    expect(getLocaleFromPath("/en")).toBe("en");
    expect(getLocaleFromPath("/ru/dashboard")).toBe("ru");
    expect(getLocaleFromPath("/dashboard")).toBeNull();
  });

  it("builds localized paths for unprefixed routes", () => {
    expect(buildLocalizedPath("/", "ru")).toBe("/ru");
    expect(buildLocalizedPath("/dashboard", "en")).toBe("/en/dashboard");
  });
});
