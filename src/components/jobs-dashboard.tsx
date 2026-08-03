"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  Timer,
  X,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_PRIORITY_LABELS,
  type Job,
  type JobPriority,
  type JobStatus,
} from "@/types/job";

type StatusFilter = JobStatus | "all";

const STATUS_BADGE_STYLES: Record<JobStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  in_progress: "border-indigo-200 bg-indigo-50 text-indigo-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const PRIORITY_BADGE_STYLES: Record<JobPriority, string> = {
  low: "border-slate-200 bg-slate-50 text-slate-600",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-rose-200 bg-rose-50 text-rose-700",
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function fetchJobs() {
  return supabase.from("jobs").select("*").order("created_at", { ascending: false });
}

type JobsQueryResult = Awaited<ReturnType<typeof fetchJobs>>;

export default function JobsDashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const applyResult = useCallback(({ data, error }: JobsQueryResult) => {
    if (error) {
      setLoadError(error.message);
    } else {
      setJobs(data ?? []);
      setLoadError(null);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchJobs().then((result) => {
      if (!cancelled) applyResult(result);
    });

    return () => {
      cancelled = true;
    };
  }, [applyResult]);

  async function handleRefresh() {
    setRefreshing(true);
    applyResult(await fetchJobs());
  }

  async function handleRetry() {
    setLoading(true);
    setLoadError(null);
    applyResult(await fetchJobs());
  }

  async function handleStatusChange(job: Job, status: JobStatus) {
    if (status === job.status) return;

    const previousStatus = job.status;
    setUpdatingId(job.id);
    setUpdateError(null);
    setJobs((current) =>
      current.map((item) => (item.id === job.id ? { ...item, status } : item)),
    );

    const { error } = await supabase.from("jobs").update({ status }).eq("id", job.id);

    if (error) {
      setJobs((current) =>
        current.map((item) =>
          item.id === job.id ? { ...item, status: previousStatus } : item,
        ),
      );
      setUpdateError(`Could not update "${job.title}": ${error.message}`);
    }

    setUpdatingId(null);
  }

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;
      const matchesSearch = query === "" || job.title.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [jobs, search, statusFilter]);

  const stats = useMemo(
    () => ({
      total: jobs.length,
      pending: jobs.filter((job) => job.status === "pending").length,
      in_progress: jobs.filter((job) => job.status === "in_progress").length,
      completed: jobs.filter((job) => job.status === "completed").length,
    }),
    [jobs],
  );

  const isFiltered = search.trim() !== "" || statusFilter !== "all";

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total jobs"
          value={stats.total}
          loading={loading}
          icon={Inbox}
          accent="text-slate-500 bg-slate-100"
        />
        <StatCard
          label="Pending"
          value={stats.pending}
          loading={loading}
          icon={CircleDashed}
          accent="text-amber-600 bg-amber-50"
        />
        <StatCard
          label="In progress"
          value={stats.in_progress}
          loading={loading}
          icon={Timer}
          accent="text-indigo-600 bg-indigo-50"
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          loading={loading}
          icon={CheckCircle2}
          accent="text-emerald-600 bg-emerald-50"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title…"
              aria-label="Search jobs by title"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
            />
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="status-filter" className="sr-only">
              Filter by status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
            >
              <option value="all">All statuses</option>
              {JOB_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {JOB_STATUS_LABELS[status]}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${refreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>
        </div>

        {updateError ? (
          <div
            role="alert"
            className="flex items-start gap-3 border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="flex-1">{updateError}</p>
            <button
              type="button"
              onClick={() => setUpdateError(null)}
              aria-label="Dismiss error"
              className="rounded-md p-0.5 text-rose-500 transition hover:bg-rose-100"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {loadError ? (
          <ErrorState message={loadError} onRetry={handleRetry} />
        ) : loading ? (
          <TableSkeleton />
        ) : filteredJobs.length === 0 ? (
          <EmptyState
            isFiltered={isFiltered}
            onClear={() => {
              setSearch("");
              setStatusFilter("all");
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th scope="col" className="px-4 py-3">
                    Job
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Priority
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Budget
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Created
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="transition hover:bg-slate-50/60">
                    <td className="max-w-sm px-4 py-3.5 align-top">
                      <p className="font-medium text-slate-900">{job.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-slate-500">{job.description}</p>
                    </td>
                    <td className="px-4 py-3.5 align-top text-slate-600">{job.client_email}</td>
                    <td className="px-4 py-3.5 align-top">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${PRIORITY_BADGE_STYLES[job.priority]}`}
                      >
                        {JOB_PRIORITY_LABELS[job.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right align-top font-medium tabular-nums text-slate-900">
                      {currency.format(job.budget)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 align-top text-slate-500">
                      {dateFormat.format(new Date(job.created_at))}
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <div className="flex items-center gap-2">
                        <div
                          className={`relative rounded-full border ${STATUS_BADGE_STYLES[job.status]}`}
                        >
                          <label htmlFor={`status-${job.id}`} className="sr-only">
                            Status for {job.title}
                          </label>
                          <select
                            id={`status-${job.id}`}
                            value={job.status}
                            disabled={updatingId === job.id}
                            onChange={(event) =>
                              void handleStatusChange(job, event.target.value as JobStatus)
                            }
                            className="cursor-pointer appearance-none rounded-full bg-transparent py-1 pl-3 pr-7 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-wait"
                          >
                            {JOB_STATUSES.map((status) => (
                              <option key={status} value={status} className="text-slate-900">
                                {JOB_STATUS_LABELS[status]}
                              </option>
                            ))}
                          </select>
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 12 12"
                            className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 fill-none stroke-current stroke-[1.5]"
                          >
                            <path d="m2.5 4.5 3.5 3.5 3.5-3.5" strokeLinecap="round" />
                          </svg>
                        </div>
                        {updatingId === job.id ? (
                          <Loader2
                            className="size-4 animate-spin text-slate-400"
                            aria-label="Saving status"
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !loadError && filteredJobs.length > 0 ? (
          <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            Showing {filteredJobs.length} of {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  loading: boolean;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`flex size-8 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="size-4" aria-hidden={true} />
        </span>
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-14 animate-pulse rounded-md bg-slate-100" />
      ) : (
        <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
          {value}
        </p>
      )}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading jobs…</span>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="hidden h-3.5 w-40 animate-pulse rounded bg-slate-100 sm:block" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
          <div className="h-3.5 w-16 animate-pulse rounded bg-slate-100" />
          <div className="h-6 w-24 animate-pulse rounded-full bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ isFiltered, onClear }: { isFiltered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Inbox className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">
        {isFiltered ? "No jobs match your filters" : "No jobs yet"}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {isFiltered
          ? "Try a different search term or switch the status filter."
          : "Submitted requests from the landing page will show up here."}
      </p>
      {isFiltered ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">Couldn&apos;t load jobs</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}
