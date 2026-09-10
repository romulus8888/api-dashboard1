import { describe, expect, it } from "vitest";

import { validateReturnPath } from "@/lib/auth/return-path";

describe("validateReturnPath", () => {
  it("returns the fallback dashboard path when returnTo is missing", () => {
    expect(validateReturnPath(null, "en")).toBe("/en/dashboard");
  });

  it("preserves valid internal locale paths", () => {
    expect(validateReturnPath("/ru/dashboard", "ru")).toBe("/ru/dashboard");
  });

  it("rejects open redirects and external URLs", () => {
    expect(validateReturnPath("https://evil.example/ru/dashboard", "ru")).toBe("/ru/dashboard");
    expect(validateReturnPath("//evil.example/ru/dashboard", "ru")).toBe("/ru/dashboard");
    expect(validateReturnPath("/en/login", "en")).toBe("/en/dashboard");
    expect(validateReturnPath("/fr/dashboard", "en")).toBe("/en/dashboard");
  });
});
