"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LOCALES } from "@/i18n/config";
import { switchLocalePath } from "@/i18n/switch-locale-path";
import { useLocaleContext } from "@/i18n/locale-provider";
import { cn } from "@/lib/utils";

export function LocaleSwitcher() {
  const pathname = usePathname();
  const { locale, dictionary } = useLocaleContext();

  return (
    <nav aria-label={dictionary.common.localeSwitcherLabel}>
      <ul className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold shadow-sm">
        {LOCALES.map((targetLocale) => (
          <li key={targetLocale}>
            <Link
              href={switchLocalePath(pathname, targetLocale)}
              aria-current={locale === targetLocale ? "page" : undefined}
              className={cn(
                "inline-flex min-w-9 items-center justify-center rounded-md px-2 py-1.5 transition",
                locale === targetLocale
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {targetLocale === "en"
                ? dictionary.common.localeEn
                : dictionary.common.localeRu}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
