"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AdminLeadsApiError, fetchAdminMetrics } from "@/lib/admin/admin-leads-client";
import { isAdminSessionExpired } from "@/lib/auth/admin-session-expiry";
import type { LeadMetrics } from "@/types/metrics";

export type MetricsLoadErrorCode = "forbidden" | "load_failed";

export interface UseMetricsOptions {
  onSessionExpired?: () => void;
}

export interface UseMetricsResult {
  metrics: LeadMetrics | null;
  loading: boolean;
  loadError: MetricsLoadErrorCode | null;
  clearMetrics: () => void;
  reload: () => void;
}

function toLoadErrorCode(error: unknown): MetricsLoadErrorCode {
  if (error instanceof AdminLeadsApiError && error.code === "forbidden") {
    return "forbidden";
  }

  return "load_failed";
}

export function useMetrics({ onSessionExpired }: UseMetricsOptions = {}): UseMetricsResult {
  const [metrics, setMetrics] = useState<LeadMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<MetricsLoadErrorCode | null>(null);
  const [loadToken, setLoadToken] = useState(0);
  const onSessionExpiredRef = useRef(onSessionExpired);

  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  const clearMetrics = useCallback(() => {
    setMetrics(null);
    setLoadError(null);
  }, []);

  const notifySessionExpired = useCallback(() => {
    onSessionExpiredRef.current?.();
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchAdminMetrics().then(
      (data) => {
        if (cancelled) return;
        setMetrics(data);
        setLoadError(null);
        setLoading(false);
      },
      (error: unknown) => {
        if (cancelled) return;

        if (isAdminSessionExpired(error)) {
          notifySessionExpired();
          setLoading(false);
          return;
        }

        setLoadError(toLoadErrorCode(error));
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [loadToken, notifySessionExpired]);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setLoadToken((token) => token + 1);
  }, []);

  return {
    metrics,
    loading,
    loadError,
    clearMetrics,
    reload,
  };
}
