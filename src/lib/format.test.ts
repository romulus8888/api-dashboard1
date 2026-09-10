import { describe, expect, it } from "vitest";

import { formatCurrency, formatDate } from "@/lib/format";

describe("format helpers", () => {
  it("formats currency using the row currency and locale", () => {
    expect(formatCurrency(12000, "en", "USD")).toMatch(/\$12,000/);
    expect(formatCurrency(12000, "ru", "USD")).toMatch(/12\s?000/);
  });

  it("formats dates using the active locale", () => {
    const value = "2026-09-10T12:00:00.000Z";
    const en = formatDate(value, "en");
    const ru = formatDate(value, "ru");

    expect(en).toMatch(/Sep/);
    expect(ru).toMatch(/сент/i);
  });
});
