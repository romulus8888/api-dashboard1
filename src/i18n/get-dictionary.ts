import "server-only";

import type { Locale } from "@/i18n/config";
import { en } from "@/i18n/dictionaries/en";
import { ru } from "@/i18n/dictionaries/ru";
import type { Dictionary } from "@/i18n/dictionaries/types";

const dictionaries: Record<Locale, Dictionary> = {
  en,
  ru,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
