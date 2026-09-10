"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AdminLeadsApiError,
  fetchAdminLeads,
  type AdminLeadListItem,
  updateAdminLeadStatus,
} from "@/lib/admin/admin-leads-client";
import { isAdminSessionExpired } from "@/lib/auth/admin-session-expiry";
import type { LeadStatus } from "@/types/lead";

export type LeadsLoadErrorCode = "forbidden" | "load_failed";

export interface UseLeadsOptions {
  onSessionExpired?: () => void;
}

export interface UseLeadsResult {
  leads: AdminLeadListItem[];
  loading: boolean;
  refreshing: boolean;
  loadError: LeadsLoadErrorCode | null;
  updatingLeadId: string | null;
  reload: () => void;
  refresh: () => Promise<void>;
  updateStatus: (lead: AdminLeadListItem, status: LeadStatus) => Promise<void>;
}

function toLoadErrorCode(error: unknown): LeadsLoadErrorCode {
  if (error instanceof AdminLeadsApiError && error.code === "forbidden") {
    return "forbidden";
  }

  return "load_failed";
}

function handleSessionExpiry(
  onSessionExpired: (() => void) | undefined,
  clearState: () => void,
): boolean {
  if (!onSessionExpired) {
    return false;
  }

  clearState();
  onSessionExpired();
  return true;
}

export function useLeads({ onSessionExpired }: UseLeadsOptions = {}): UseLeadsResult {
  const [leads, setLeads] = useState<AdminLeadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<LeadsLoadErrorCode | null>(null);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [loadToken, setLoadToken] = useState(0);
  const isMounted = useRef(true);
  const onSessionExpiredRef = useRef(onSessionExpired);

  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const clearLoadedLeads = useCallback(() => {
    setLeads([]);
    setLoadError(null);
    setUpdatingLeadId(null);
  }, []);

  const notifySessionExpired = useCallback(() => {
    handleSessionExpiry(onSessionExpiredRef.current, clearLoadedLeads);
  }, [clearLoadedLeads]);

  useEffect(() => {
    let cancelled = false;

    void fetchAdminLeads().then(
      (data) => {
        if (cancelled) return;
        setLeads(data);
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

  const refresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const data = await fetchAdminLeads();
      if (isMounted.current) {
        setLeads(data);
        setLoadError(null);
      }
    } catch (error) {
      if (isMounted.current && isAdminSessionExpired(error)) {
        notifySessionExpired();
        return;
      }

      throw error;
    } finally {
      if (isMounted.current) setRefreshing(false);
    }
  }, [notifySessionExpired]);

  const patchStatus = useCallback((id: string, status: LeadStatus) => {
    setLeads((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
  }, []);

  const updateStatus = useCallback(
    async (lead: AdminLeadListItem, status: LeadStatus) => {
      const previousStatus = lead.status;
      setUpdatingLeadId(lead.id);
      patchStatus(lead.id, status);

      try {
        await updateAdminLeadStatus(lead.id, status);
      } catch (error) {
        patchStatus(lead.id, previousStatus);

        if (isMounted.current && isAdminSessionExpired(error)) {
          notifySessionExpired();
          return;
        }

        throw error;
      } finally {
        if (isMounted.current) setUpdatingLeadId(null);
      }
    },
    [notifySessionExpired, patchStatus],
  );

  return {
    leads,
    loading,
    refreshing,
    loadError,
    updatingLeadId,
    reload,
    refresh,
    updateStatus,
  };
}
