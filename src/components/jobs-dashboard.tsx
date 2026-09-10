"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { JobDetailDrawer } from "@/components/job-detail-drawer";
import { JobsEmptyState } from "@/components/jobs-empty-state";
import { JobsErrorState } from "@/components/jobs-error-state";
import { JobsFilters } from "@/components/jobs-filters";
import { JobsStats } from "@/components/jobs-stats";
import { JobsTable } from "@/components/jobs-table";
import { JobsTableSkeleton } from "@/components/jobs-table-skeleton";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { useAdminSessionExpiry } from "@/hooks/use-admin-session-expiry";
import { useLeads } from "@/hooks/use-leads";
import { useLocaleContext } from "@/i18n/locale-provider";
import type { AdminLeadListItem } from "@/lib/admin/admin-leads-client";
import { isAdminSessionExpired } from "@/lib/auth/admin-session-expiry";
import {
  DEFAULT_LEAD_FILTERS,
  filterLeads,
  hasActiveFilters,
  type LeadFilters,
} from "@/lib/lead-filters";
import type { LeadStatus } from "@/types/lead";

export default function JobsDashboard() {
  const { dictionary } = useLocaleContext();
  const a11y = dictionary.accessibility;

  return (
    <ToastProvider
      labels={{
        regionLabel: a11y.notifications,
        dismissLabel: a11y.dismissNotification,
      }}
    >
      <JobsDashboardContent loadingLabel={a11y.loadingLeads} />
    </ToastProvider>
  );
}

export function JobsDashboardContent({ loadingLabel }: { loadingLabel: string }) {
  const { dictionary } = useLocaleContext();
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_LEAD_FILTERS);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const clearLoadedLeadsRef = useRef<() => void>(() => {});

  const handleSessionExpired = useAdminSessionExpiry({
    clearLoadedLeads: () => clearLoadedLeadsRef.current(),
    clearSelectedLead: () => setSelectedLeadId(null),
  });

  const { leads, loading, refreshing, loadError, updatingLeadId, clearLoadedLeads, reload, refresh, updateStatus } =
    useLeads({ onSessionExpired: handleSessionExpired });

  useEffect(() => {
    clearLoadedLeadsRef.current = clearLoadedLeads;
  }, [clearLoadedLeads]);

  const { toast } = useToast();

  const visibleLeads = useMemo(() => filterLeads(leads, filters), [leads, filters]);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  const resetFilters = useCallback(() => setFilters(DEFAULT_LEAD_FILTERS), []);

  const resolvedLoadError = useMemo(() => {
    if (!loadError) return null;
    if (loadError === "forbidden") return dictionary.leads.error.forbidden;
    return dictionary.leads.error.loadFailed;
  }, [dictionary, loadError]);

  const handleRefresh = useCallback(async () => {
    try {
      await refresh();
    } catch (error) {
      if (isAdminSessionExpired(error)) {
        return;
      }

      toast({
        variant: "error",
        title: dictionary.leads.toasts.refreshFailedTitle,
        description: dictionary.leads.error.refreshFailed,
      });
    }
  }, [dictionary, refresh, toast]);

  const handleStatusChange = useCallback(
    async (lead: AdminLeadListItem, status: LeadStatus) => {
      if (lead.status === status) return;

      try {
        await updateStatus(lead, status);
        toast({
          variant: "success",
          title: dictionary.leads.toasts.statusUpdatedTitle,
          description: dictionary.leads.toasts.statusUpdatedDescription
            .replace("{title}", lead.title)
            .replace("{status}", dictionary.leads.status[status]),
        });
      } catch (error) {
        if (isAdminSessionExpired(error)) {
          return;
        }

        toast({
          variant: "error",
          title: dictionary.leads.toasts.statusUpdateFailedTitle,
          description: dictionary.leads.error.updateFailed,
        });
      }
    },
    [dictionary, toast, updateStatus],
  );

  const countUnit =
    leads.length === 1
      ? dictionary.dashboard.showingCountSingular
      : dictionary.dashboard.showingCountPlural;

  return (
    <div className="space-y-6">
      <JobsStats leads={leads} loading={loading} />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <JobsFilters
          filters={filters}
          onChange={setFilters}
          onReset={resetFilters}
          onRefresh={() => void handleRefresh()}
          refreshDisabled={loading || refreshing}
          refreshing={refreshing}
        />

        {resolvedLoadError ? (
          <JobsErrorState message={resolvedLoadError} onRetry={reload} />
        ) : loading ? (
          <JobsTableSkeleton loadingLabel={loadingLabel} />
        ) : visibleLeads.length === 0 ? (
          <JobsEmptyState filtered={hasActiveFilters(filters)} onClearFilters={resetFilters} />
        ) : (
          <>
            <JobsTable
              leads={visibleLeads}
              selectedLeadId={selectedLeadId}
              updatingLeadId={updatingLeadId}
              onSelectLead={(lead) => setSelectedLeadId(lead.id)}
              onStatusChange={(lead, status) => void handleStatusChange(lead, status)}
            />
            <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              {dictionary.dashboard.showingCount
                .replace("{visible}", String(visibleLeads.length))
                .replace("{total}", String(leads.length))
                .replace("{unit}", countUnit)}
            </p>
          </>
        )}
      </section>

      <JobDetailDrawer
        lead={selectedLead}
        updating={selectedLead !== null && updatingLeadId === selectedLead.id}
        onClose={() => setSelectedLeadId(null)}
        onSessionExpired={handleSessionExpired}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
