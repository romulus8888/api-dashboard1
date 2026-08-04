import type { Job, JobPriority, JobStatus } from "@/types/job";

export type StatusFilter = JobStatus | "all";

export type PriorityFilter = JobPriority | "all";

export interface JobFilters {
  search: string;
  status: StatusFilter;
  priority: PriorityFilter;
}

export const DEFAULT_JOB_FILTERS: JobFilters = {
  search: "",
  status: "all",
  priority: "all",
};

export function hasActiveFilters(filters: JobFilters): boolean {
  return filters.search.trim() !== "" || filters.status !== "all" || filters.priority !== "all";
}

export function filterJobs(jobs: Job[], filters: JobFilters): Job[] {
  const query = filters.search.trim().toLowerCase();

  return jobs.filter((job) => {
    if (filters.status !== "all" && job.status !== filters.status) return false;
    if (filters.priority !== "all" && job.priority !== filters.priority) return false;
    if (query === "") return true;

    return (
      job.title.toLowerCase().includes(query) || job.client_email.toLowerCase().includes(query)
    );
  });
}
