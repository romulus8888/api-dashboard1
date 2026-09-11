"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AdminLeadsApiError,
  fetchAdminLeads,
  patchAdminLead,
  type AdminLeadDetail,
  type AdminLeadListItem,
  type AdminLeadPatchInput,
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
  patchingLeadId: string | null;
  clearLoadedLeads: () => void;
  reload: () => void;
  refresh: () => Promise<void>;
  updateStatus: (lead: AdminLeadListItem, status: LeadStatus, reason?: string) => Promise<void>;
  patchLead: (lead: AdminLeadListItem, patch: AdminLeadPatchInput) => Promise<AdminLeadDetail>;
  replaceLead: (lead: AdminLeadDetail) => void;
}

function toLoadErrorCode(error: unknown): LeadsLoadErrorCode {
  if (error instanceof AdminLeadsApiError && error.code === "forbidden") {
    return "forbidden";
  }

  return "load_failed";
}

function toListItem(lead: AdminLeadDetail): AdminLeadListItem {
  return {
    id: lead.id,
    status: lead.status,
    priority: lead.priority,
    source: lead.source,
    locale: lead.locale,
    contact_name: lead.contact_name,
    contact_email: lead.contact_email,
    title: lead.title,
    budget_amount: lead.budget_amount,
    budget_currency: lead.budget_currency,
    owner_id: lead.owner_id,
    next_action_at: lead.next_action_at,
    first_response_due_at: lead.first_response_due_at,
    is_synthetic: lead.is_synthetic,
    created_at: lead.created_at,
    updated_at: lead.updated_at,
  };
}

export function useLeads({ onSessionExpired }: UseLeadsOptions = {}): UseLeadsResult {
  const [leads, setLeads] = useState<AdminLeadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<LeadsLoadErrorCode | null>(null);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [patchingLeadId, setPatchingLeadId] = useState<string | null>(null);
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
    setPatchingLeadId(null);
  }, []);

  const notifySessionExpired = useCallback(() => {
    onSessionExpiredRef.current?.();
  }, []);

  const replaceLead = useCallback((lead: AdminLeadDetail) => {
    const listItem = toListItem(lead);
    setLeads((current) => current.map((item) => (item.id === lead.id ? listItem : item)));
  }, []);

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

  const patchLeadFields = useCallback((id: string, patch: AdminLeadPatchInput) => {
    setLeads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const updateStatus = useCallback(
    async (lead: AdminLeadListItem, status: LeadStatus, reason?: string) => {
      const previousStatus = lead.status;
      setUpdatingLeadId(lead.id);
      patchStatus(lead.id, status);

      try {
        const updated = await updateAdminLeadStatus(lead.id, status, reason);
        if (isMounted.current) replaceLead(updated);
      } catch (error) {
        patchStatus(lead.id, previousStatus);

        if (isMounted.current && isAdminSessionExpired(error)) {
          notifySessionExpired();
        }

        throw error;
      } finally {
        if (isMounted.current) setUpdatingLeadId(null);
      }
    },
    [notifySessionExpired, patchStatus, replaceLead],
  );

  const patchLead = useCallback(
    async (lead: AdminLeadListItem, patch: AdminLeadPatchInput) => {
      const previous = { ...lead };
      setPatchingLeadId(lead.id);
      patchLeadFields(lead.id, patch);

      try {
        const updated = await patchAdminLead(lead.id, {
          ...patch,
          updated_at: lead.updated_at,
        });
        if (isMounted.current) replaceLead(updated);
        return updated;
      } catch (error) {
        patchLeadFields(lead.id, previous);

        if (isMounted.current && isAdminSessionExpired(error)) {
          notifySessionExpired();
        }

        throw error;
      } finally {
        if (isMounted.current) setPatchingLeadId(null);
      }
    },
    [notifySessionExpired, patchLeadFields, replaceLead],
  );

  return {
    leads,
    loading,
    refreshing,
    loadError,
    updatingLeadId,
    patchingLeadId,
    clearLoadedLeads,
    reload,
    refresh,
    updateStatus,
    patchLead,
    replaceLead,
  };
}
