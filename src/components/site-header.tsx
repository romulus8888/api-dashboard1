import Link from "next/link";
import { ArrowLeft, LayoutDashboard, Sparkles } from "lucide-react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/types";

interface SiteHeaderProps {
  locale: Locale;
  dictionary: Dictionary;
  variant?: "landing" | "dashboard";
  showLogout?: boolean;
}

export function SiteHeader({
  locale,
  dictionary,
  variant = "landing",
  showLogout = false,
}: SiteHeaderProps) {
  const homeHref = `/${locale}`;
  const dashboardHref = `/${locale}/dashboard`;

  return (
    <header
      className={
        variant === "landing"
          ? "sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur"
          : "border-b border-slate-200 bg-white"
      }
    >
      <div
        className={
          variant === "landing"
            ? "mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6"
            : "mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6"
        }
      >
        <Link href={homeHref} className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/30">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <span className="text-base font-semibold tracking-tight">{dictionary.common.brand}</span>
        </Link>

        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          {showLogout ? (
            <LogoutButton />
          ) : variant === "landing" ? (
            <Link
              href={dashboardHref}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <LayoutDashboard className="size-4" aria-hidden="true" />
              {dictionary.common.dashboard}
            </Link>
          ) : (
            <Link
              href={homeHref}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {dictionary.common.backToSite}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
