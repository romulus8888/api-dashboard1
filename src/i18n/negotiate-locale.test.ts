import { describe, expect, it } from "vitest";

import { negotiateLocale } from "@/i18n/negotiate-locale";

describe("negotiateLocale", () => {
  it("prefers the saved locale cookie", () => {
    expect(
      negotiateLocale({
        cookieValue: "ru",
        acceptLanguage: "en-US,en;q=0.9",
      }),
    ).toBe("ru");
  });

  it("uses Russian Accept-Language when no cookie is present", () => {
    expect(
      negotiateLocale({
        cookieValue: null,
        acceptLanguage: "ru-RU,ru;q=0.9,en;q=0.8",
      }),
    ).toBe("ru");
  });

  it("falls back to English", () => {
    expect(
      negotiateLocale({
        cookieValue: "fr",
        acceptLanguage: "de-DE,de;q=0.9",
      }),
    ).toBe("en");
  });
});
