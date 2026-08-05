const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

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

export function formatCurrency(value: number | null | undefined): string {
  const amount = toFiniteNumber(value);
  return amount === null ? PLACEHOLDER : currencyFormatter.format(amount);
}

export function formatDate(value: string | null | undefined): string {
  const date = toValidDate(value);
  return date === null ? PLACEHOLDER : dateFormatter.format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  const date = toValidDate(value);
  return date === null ? PLACEHOLDER : dateTimeFormatter.format(date);
}
