"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useLocaleContext } from "@/i18n/locale-provider";
import { buildAdminLoginPath } from "@/lib/auth/admin-session-expiry";

export interface AdminSessionExpiryActions {
  clearLoadedLeads: () => void;
  clearSelectedLead: () => void;
}

export function useAdminSessionExpiry(actions: AdminSessionExpiryActions) {
  const router = useRouter();
  const { locale } = useLocaleContext();
  const handledRef = useRef(false);
  const actionsRef = useRef(actions);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  return useCallback(() => {
    if (handledRef.current) {
      return;
    }

    handledRef.current = true;
    actionsRef.current.clearLoadedLeads();
    actionsRef.current.clearSelectedLead();
    router.replace(buildAdminLoginPath(locale));
  }, [locale, router]);
}
