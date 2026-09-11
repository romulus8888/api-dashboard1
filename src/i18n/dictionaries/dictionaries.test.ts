import { describe, expect, it } from "vitest";

import { LOCALES } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

const ENGLISH_ONLY_PHRASES = [
  "Generate demo lead",
  "View the dashboard",
  "All statuses",
  "Couldn't load leads",
  "Try again",
  "Refresh",
  "Reset",
  "Invalid email or password.",
];

function collectStringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStringValues);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStringValues);
  }

  return [];
}

describe("dictionaries", () => {
  it("renders supported locales", () => {
    for (const locale of LOCALES) {
      const dictionary = getDictionary(locale);
      expect(dictionary.locale).toBe(locale);
      expect(dictionary.metadata.homeTitle.length).toBeGreaterThan(0);
      expect(dictionary.metadata.loginTitle.length).toBeGreaterThan(0);
      expect(dictionary.landing.title.length).toBeGreaterThan(0);
      expect(dictionary.dashboard.title.length).toBeGreaterThan(0);
    }
  });

  it("localizes metadata and auth copy per locale", () => {
    const en = getDictionary("en");
    const ru = getDictionary("ru");

    expect(en.metadata.loginDescription).not.toBe(ru.metadata.loginDescription);
    expect(ru.metadata.dashboardDescription).toMatch(/[А-Яа-яЁё]/);
    expect(ru.auth.invalidCredentials).toMatch(/[А-Яа-яЁё]/);
  });

  it("localizes accessibility labels for EN and RU", () => {
    const en = getDictionary("en");
    const ru = getDictionary("ru");

    expect(en.accessibility.loadingLeads).toBe("Loading leads…");
    expect(ru.accessibility.loadingLeads).toBe("Загрузка лидов…");
    expect(ru.accessibility.notifications).not.toBe(en.accessibility.notifications);
  });

  it("avoids unintended English on reachable Russian UI copy", () => {
    const ruValues = collectStringValues(getDictionary("ru")).join("\n");

    for (const phrase of ENGLISH_ONLY_PHRASES) {
      expect(ruValues).not.toContain(phrase);
    }
  });

  it("localizes operational lead management copy", () => {
    const en = getDictionary("en");
    const ru = getDictionary("ru");

    expect(en.leads.source.demo_seed).toBe("Demo seed");
    expect(ru.leads.detail.comments).toMatch(/[А-Яа-яЁё]/);
    expect(ru.leads.overdue).toMatch(/[А-Яа-яЁё]/);
  });

  it("localizes funnel metrics copy for EN and RU", () => {
    const en = getDictionary("en");
    const ru = getDictionary("ru");

    expect(en.leads.metrics.title).toBe("Funnel metrics");
    expect(ru.leads.metrics.title).toMatch(/[А-Яа-яЁё]/);
    expect(ru.leads.metrics.emptyTitle).toMatch(/[А-Яа-яЁё]/);
  });

  it("localizes detail loading and comment labels for EN and RU", () => {
    const en = getDictionary("en");
    const ru = getDictionary("ru");

    expect(en.leads.detail.loading).toBe("Loading lead details…");
    expect(ru.leads.detail.loading).toBe("Загрузка деталей лида…");
    expect(en.leads.detail.commentLabel).toBe("Comment");
    expect(ru.leads.detail.commentLabel).toBe("Комментарий");
    expect(ru.leads.detail.loading).not.toBe(en.leads.detail.loading);
  });

  it("maps language-neutral API error codes to localized messages", () => {
    const en = getDictionary("en");
    const ru = getDictionary("ru");

    expect(en.errors.api.rate_limited).toMatch(/Too many/i);
    expect(ru.errors.api.rate_limited).toMatch(/[А-Яа-яЁё]/);
    expect(en.errors.login.invalid_credentials).not.toBe(ru.errors.login.invalid_credentials);
  });
});
