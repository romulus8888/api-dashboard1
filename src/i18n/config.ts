import type { LeadLocale } from "@/types/lead";

export const LOCALES = ["en", "ru"] as const satisfies readonly LeadLocale[];

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE_NAME = "northwind_locale";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function assertLocale(value: string): Locale {
  if (!isLocale(value)) {
    throw new Error(`Unsupported locale: ${value}`);
  }

  return value;
}

export function toIntlLocale(locale: Locale): string {
  return locale === "ru" ? "ru-RU" : "en-US";
}
