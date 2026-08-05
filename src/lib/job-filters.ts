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

/**
 * Rows come from the database, so a column can be null or hold an unexpected type
 * even though `Job` types it as a string. Coercing here keeps `.toLowerCase()` from
 * throwing and taking the whole page down mid-keystroke.
 *
 * Numbers stay searchable (including `0`), but booleans and objects resolve to ""
 * rather than "false"/"[object Object]", which would otherwise produce phantom
 * matches for common letters.
 */
function toSearchableText(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function hasActiveFilters(filters: JobFilters | null | undefined): boolean {
  if (!filters) return false;

  return (
    (filters.search ?? "").trim() !== "" ||
    (filters.status ?? "all") !== "all" ||
    (filters.priority ?? "all") !== "all"
  );
}

export function filterJobs(
  jobs: Job[] | null | undefined,
  filters: JobFilters | null | undefined,
): Job[] {
  const query = (filters?.search ?? "").trim().toLowerCase();
  const statusFilter = filters?.status ?? "all";
  const priorityFilter = filters?.priority ?? "all";

  return (jobs ?? []).filter((job) => {
    if (!job) return false;
    if (statusFilter !== "all" && job.status !== statusFilter) return false;
    if (priorityFilter !== "all" && job.priority !== priorityFilter) return false;
    if (query === "") return true;

    return (
      toSearchableText(job.title).includes(query) ||
      toSearchableText(job.client_email).includes(query)
    );
  });
}
