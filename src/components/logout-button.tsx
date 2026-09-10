"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { useLocaleContext } from "@/i18n/locale-provider";

export function LogoutButton() {
  const router = useRouter();
  const { locale, dictionary } = useLocaleContext();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    setIsSubmitting(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      router.replace(`/${locale}/login`);
      router.refresh();
      setIsSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={isSubmitting}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isSubmitting ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <LogOut className="size-4" aria-hidden="true" />
      )}
      {dictionary.common.logout}
    </button>
  );
}
