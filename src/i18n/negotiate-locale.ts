import type { Locale } from "@/i18n/config";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

function parseAcceptLanguage(header: string): Locale | null {
  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const quality = params
        .find((param) => param.trim().startsWith("q="))
        ?.split("=")[1];
      return {
        tag: tag.toLowerCase(),
        quality: quality ? Number.parseFloat(quality) : 1,
      };
    })
    .filter((entry) => Number.isFinite(entry.quality))
    .sort((left, right) => right.quality - left.quality);

  for (const candidate of candidates) {
    if (candidate.tag === "ru" || candidate.tag.startsWith("ru-")) {
      return "ru";
    }

    if (candidate.tag === "en" || candidate.tag.startsWith("en-")) {
      return "en";
    }
  }

  return null;
}

export function negotiateLocale(options: {
  cookieValue?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (options.cookieValue && isLocale(options.cookieValue)) {
    return options.cookieValue;
  }

  if (options.acceptLanguage) {
    const preferred = parseAcceptLanguage(options.acceptLanguage);
    if (preferred) {
      return preferred;
    }
  }

  return DEFAULT_LOCALE;
}
