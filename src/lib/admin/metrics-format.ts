import type { Locale } from "@/i18n/config";
import { toIntlLocale } from "@/i18n/config";

const PLACEHOLDER = "—";

export function formatPercent(
  value: number | null | undefined,
  locale: Locale,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return PLACEHOLDER;
  }

  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatInteger(
  value: number | null | undefined,
  locale: Locale,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return PLACEHOLDER;
  }

  return new Intl.NumberFormat(toIntlLocale(locale), {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDurationSeconds(
  seconds: number | null | undefined,
  locale: Locale,
): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return PLACEHOLDER;
  }

  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return new Intl.NumberFormat(toIntlLocale(locale), {
      style: "unit",
      unit: "minute",
      unitDisplay: "short",
      maximumFractionDigits: 0,
    }).format(totalMinutes);
  }

  const totalHours = Math.round(seconds / 3600);
  if (totalHours < 48) {
    return new Intl.NumberFormat(toIntlLocale(locale), {
      style: "unit",
      unit: "hour",
      unitDisplay: "short",
      maximumFractionDigits: 0,
    }).format(totalHours);
  }

  const totalDays = Math.round(seconds / 86400);
  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: "unit",
    unit: "day",
    unitDisplay: "short",
    maximumFractionDigits: 0,
  }).format(totalDays);
}

export function formatMetricsDateRange(
  from: string,
  to: string,
  locale: Locale,
): string {
  const formatter = new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return PLACEHOLDER;
  }

  return `${formatter.format(fromDate)} – ${formatter.format(toDate)} UTC`;
}
