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
import {
  DEFAULT_JOB_FILTERS,
  filterJobs,
  hasActiveFilters,
  type JobFilters,
} from "@/lib/job-filters";
import { getErrorMessage } from "@/lib/utils";
import { JOB_STATUS_LABELS, type Job, type JobStatus } from "@/types/job";

export default function JobsDashboard() {
  return (
    <ToastProvider>
      <JobsDashboardContent />
    </ToastProvider>
  );
}

function JobsDashboardContent() {
  const { jobs, loading, refreshing, loadError, updatingJobId, reload, refresh, updateStatus } =
    useJobs();
  const { toast } = useToast();

  const [filters, setFilters] = useState<JobFilters>(DEFAULT_JOB_FILTERS);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const visibleJobs = useMemo(() => filterJobs(jobs, filters), [jobs, filters]);

  // Resolved from `jobs` rather than stored, so the drawer reflects status updates live.
  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const resetFilters = useCallback(() => setFilters(DEFAULT_JOB_FILTERS), []);

  const handleRefresh = useCallback(async () => {
    try {
      await refresh();
    } catch (error) {
      toast({
        variant: "error",
        title: "Refresh failed",
        description: getErrorMessage(error),
      });
    }
  }, [refresh, toast]);

  const handleStatusChange = useCallback(
    async (job: Job, status: JobStatus) => {
      if (job.status === status) return;

      try {
        await updateStatus(job, status);
        toast({
          variant: "success",
          title: "Status updated",
          description: `“${job.title}” is now ${JOB_STATUS_LABELS[status]}.`,
        });
      } catch (error) {
        toast({
          variant: "error",
          title: "Couldn't update status",
          description: getErrorMessage(error),
        });
      }
    },
    [toast, updateStatus],
  );

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

        {loadError ? (
          <JobsErrorState message={loadError} onRetry={reload} />
        ) : loading ? (
          <JobsTableSkeleton />
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
              Showing {visibleJobs.length} of {jobs.length}{" "}
              {jobs.length === 1 ? "request" : "requests"}
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
