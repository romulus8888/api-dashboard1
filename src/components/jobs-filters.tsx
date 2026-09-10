import { RefreshCw, Search, X } from "lucide-react";

import { Select, type SelectOption } from "@/components/ui/select";
import { useLocaleContext } from "@/i18n/locale-provider";
import {
  hasActiveFilters,
  type LeadFilters,
  type PriorityFilter,
  type StatusFilter,
} from "@/lib/lead-filters";
import { LEAD_PRIORITIES, LEAD_STATUSES } from "@/types/lead";

export interface JobsFiltersProps {
  filters: LeadFilters;
  onChange: (filters: LeadFilters) => void;
  onReset: () => void;
  onRefresh: () => void;
  refreshDisabled: boolean;
  refreshing: boolean;
}

export function JobsFilters({
  filters,
  onChange,
  onReset,
  onRefresh,
  refreshDisabled,
  refreshing,
}: JobsFiltersProps) {
  const { dictionary } = useLocaleContext();
  const labels = dictionary.leads.filters;

  const statusFilterOptions: SelectOption<StatusFilter>[] = [
    { value: "all", label: labels.allStatuses },
    ...LEAD_STATUSES.map((status) => ({
      value: status,
      label: dictionary.leads.status[status],
    })),
  ];

  const priorityFilterOptions: SelectOption<PriorityFilter>[] = [
    { value: "all", label: labels.allPriorities },
    ...LEAD_PRIORITIES.map((priority) => ({
      value: priority,
      label: dictionary.leads.priority[priority],
    })),
  ];

  const isFiltered = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative w-full lg:max-w-sm">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-9 pl-9 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
        />
        {filters.search ? (
          <button
            type="button"
            onClick={() => onChange({ ...filters, search: "" })}
            aria-label={labels.clearSearch}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Select
          id="status-filter"
          label={labels.statusFilter}
          hideLabel
          value={filters.status}
          options={statusFilterOptions}
          onChange={(status) => onChange({ ...filters, status })}
          className="min-w-[9.5rem] flex-1 sm:flex-none"
        />

        <Select
          id="priority-filter"
          label={labels.priorityFilter}
          hideLabel
          value={filters.priority}
          options={priorityFilterOptions}
          onChange={(priority) => onChange({ ...filters, priority })}
          className="min-w-[9.5rem] flex-1 sm:flex-none"
        />

        {isFiltered ? (
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {labels.reset}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshDisabled}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={refreshing ? "size-4 animate-spin" : "size-4"}
            aria-hidden="true"
          />
          {labels.refresh}
        </button>
      </div>
    </div>
  );
}
