import type { Locale } from "@/i18n/config";
import { toIntlLocale } from "@/i18n/config";

/** Shown instead of "$NaN" or a thrown RangeError when a row carries unusable data. */
const PLACEHOLDER = "—";

function toFiniteNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * `Intl.DateTimeFormat.format` throws `RangeError: Invalid time value` on an invalid
 * Date, which is enough to crash the whole table, so bad input degrades to a dash.
 */
function toValidDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function createCurrencyFormatter(locale: Locale, currency: string): Intl.NumberFormat {
  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

function createDateFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function createDateTimeFormatter(locale: Locale): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatCurrency(
  value: number | null | undefined,
  locale: Locale,
  currency = "USD",
): string {
  const amount = toFiniteNumber(value);
  return amount === null ? PLACEHOLDER : createCurrencyFormatter(locale, currency).format(amount);
}

export function formatDate(
  value: string | null | undefined,
  locale: Locale,
): string {
  const date = toValidDate(value);
  return date === null ? PLACEHOLDER : createDateFormatter(locale).format(date);
}

export function formatDateTime(
  value: string | null | undefined,
  locale: Locale,
): string {
  const date = toValidDate(value);
  return date === null ? PLACEHOLDER : createDateTimeFormatter(locale).format(date);
}
