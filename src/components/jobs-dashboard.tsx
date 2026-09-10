"use client";

import { useCallback, useMemo, useState } from "react";

import { JobDetailDrawer } from "@/components/job-detail-drawer";
import { JobsEmptyState } from "@/components/jobs-empty-state";
import { JobsErrorState } from "@/components/jobs-error-state";
import { JobsFilters } from "@/components/jobs-filters";
import { JobsStats } from "@/components/jobs-stats";
import { JobsTable } from "@/components/jobs-table";
import { JobsTableSkeleton } from "@/components/jobs-table-skeleton";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { useJobs } from "@/hooks/use-jobs";
import { useLocaleContext } from "@/i18n/locale-provider";
import {
  DEFAULT_JOB_FILTERS,
  filterJobs,
  hasActiveFilters,
  type JobFilters,
} from "@/lib/job-filters";
import type { Job, JobStatus } from "@/types/job";

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
      <JobsDashboardContent loadingLabel={a11y.loadingJobRequests} />
    </ToastProvider>
  );
}

function JobsDashboardContent({ loadingLabel }: { loadingLabel: string }) {
  const { dictionary } = useLocaleContext();
  const { jobs, loading, refreshing, loadError, updatingJobId, reload, refresh, updateStatus } =
    useJobs();
  const { toast } = useToast();

  const [filters, setFilters] = useState<JobFilters>(DEFAULT_JOB_FILTERS);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const visibleJobs = useMemo(() => filterJobs(jobs, filters), [jobs, filters]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const resetFilters = useCallback(() => setFilters(DEFAULT_JOB_FILTERS), []);

  const handleRefresh = useCallback(async () => {
    try {
      await refresh();
    } catch {
      toast({
        variant: "error",
        title: dictionary.jobs.toasts.refreshFailedTitle,
        description: dictionary.jobs.error.refreshFailed,
      });
    }
  }, [dictionary, refresh, toast]);

  const handleStatusChange = useCallback(
    async (job: Job, status: JobStatus) => {
      if (job.status === status) return;

      try {
        await updateStatus(job, status);
        toast({
          variant: "success",
          title: dictionary.jobs.toasts.statusUpdatedTitle,
          description: dictionary.jobs.toasts.statusUpdatedDescription
            .replace("{title}", job.title)
            .replace("{status}", dictionary.jobs.status[status]),
        });
      } catch {
        toast({
          variant: "error",
          title: dictionary.jobs.toasts.statusUpdateFailedTitle,
          description: dictionary.jobs.error.updateFailed,
        });
      }
    },
    [dictionary, toast, updateStatus],
  );

  const resolvedLoadError = loadError ? dictionary.jobs.error.loadFailed : null;

  const countUnit =
    jobs.length === 1
      ? dictionary.dashboard.showingCountSingular
      : dictionary.dashboard.showingCountPlural;

  return (
    <div className="space-y-6">
      <JobsStats jobs={jobs} loading={loading} />

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
        ) : visibleJobs.length === 0 ? (
          <JobsEmptyState filtered={hasActiveFilters(filters)} onClearFilters={resetFilters} />
        ) : (
          <>
            <JobsTable
              jobs={visibleJobs}
              selectedJobId={selectedJobId}
              updatingJobId={updatingJobId}
              onSelectJob={(job) => setSelectedJobId(job.id)}
              onStatusChange={(job, status) => void handleStatusChange(job, status)}
            />
            <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              {dictionary.dashboard.showingCount
                .replace("{visible}", String(visibleJobs.length))
                .replace("{total}", String(jobs.length))
                .replace("{unit}", countUnit)}
            </p>
          </>
        )}
      </section>

      <JobDetailDrawer
        job={selectedJob}
        updating={selectedJob !== null && updatingJobId === selectedJob.id}
        onClose={() => setSelectedJobId(null)}
        onStatusChange={(job, status) => void handleStatusChange(job, status)}
      />
    </div>
  );
}
