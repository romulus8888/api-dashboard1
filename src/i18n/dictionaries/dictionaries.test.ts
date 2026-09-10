import { describe, expect, it } from "vitest";

import { LOCALES } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

const ENGLISH_ONLY_PHRASES = [
  "Generate demo lead",
  "View the dashboard",
  "All statuses",
  "Couldn't load job requests",
  "Try again",
  "Pending",
  "In progress",
  "Refresh",
  "Reset",
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
      expect(dictionary.landing.title.length).toBeGreaterThan(0);
      expect(dictionary.dashboard.title.length).toBeGreaterThan(0);
    }
  });

  it("localizes metadata per locale", () => {
    const en = getDictionary("en");
    const ru = getDictionary("ru");

    expect(en.metadata.homeDescription).not.toBe(ru.metadata.homeDescription);
    expect(ru.metadata.dashboardDescription).toMatch(/[А-Яа-яЁё]/);
  });

  it("avoids unintended English on reachable Russian UI copy", () => {
    const ruValues = collectStringValues(getDictionary("ru")).join("\n");

    for (const phrase of ENGLISH_ONLY_PHRASES) {
      expect(ruValues).not.toContain(phrase);
    }
  });

  it("localizes accessibility labels for EN and RU", () => {
    const en = getDictionary("en");
    const ru = getDictionary("ru");

    expect(en.accessibility.loadingJobRequests).toBe("Loading job requests…");
    expect(en.accessibility.closePanel).toBe("Close panel");
    expect(en.accessibility.notifications).toBe("Notifications");
    expect(en.accessibility.dismissNotification).toBe("Dismiss notification");

    expect(ru.accessibility.loadingJobRequests).toBe("Загрузка заявок…");
    expect(ru.accessibility.closePanel).toBe("Закрыть панель");
    expect(ru.accessibility.notifications).toBe("Уведомления");
    expect(ru.accessibility.dismissNotification).toBe("Закрыть уведомление");

    expect(ru.accessibility.loadingJobRequests).toMatch(/[А-Яа-яЁё]/);
    expect(ru.accessibility.notifications).not.toBe(en.accessibility.notifications);
  });

  it("maps language-neutral API error codes to localized messages", () => {
    const en = getDictionary("en");
    const ru = getDictionary("ru");

    expect(en.errors.api.rate_limited).toMatch(/Too many/i);
    expect(ru.errors.api.rate_limited).toMatch(/[А-Яа-яЁё]/);
    expect(en.errors.api.rate_limited).not.toBe(ru.errors.api.rate_limited);
  });
});
