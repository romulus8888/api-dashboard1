import { Inbox, SearchX } from "lucide-react";

import { useLocaleContext } from "@/i18n/locale-provider";

export interface JobsEmptyStateProps {
  filtered: boolean;
  onClearFilters: () => void;
}

export function JobsEmptyState({ filtered, onClearFilters }: JobsEmptyStateProps) {
  const { dictionary } = useLocaleContext();
  const labels = dictionary.jobs.empty;
  const Icon = filtered ? SearchX : Inbox;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">
        {filtered ? labels.filteredTitle : labels.noneTitle}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {filtered ? labels.filteredDescription : labels.noneDescription}
      </p>
      {filtered ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          {labels.clearFilters}
        </button>
      ) : null}
    </div>
  );
}
