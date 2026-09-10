import { describe, expect, it } from "vitest";

import { isLocale } from "@/i18n/config";

describe("isLocale", () => {
  it("accepts supported locales only", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ru")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});
