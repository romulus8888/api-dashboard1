"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

import { useLocaleContext } from "@/i18n/locale-provider";
import { buildAdminLoginPath } from "@/lib/auth/admin-session-expiry";

export function useSessionExpiredRedirect() {
  const router = useRouter();
  const { locale } = useLocaleContext();
  const redirectedRef = useRef(false);

  return useCallback(() => {
    if (redirectedRef.current) {
      return;
    }

    redirectedRef.current = true;
    router.replace(buildAdminLoginPath(locale));
  }, [locale, router]);
}
