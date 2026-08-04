import { Inbox, SearchX } from "lucide-react";

export interface JobsEmptyStateProps {
  filtered: boolean;
  onClearFilters: () => void;
}

export function JobsEmptyState({ filtered, onClearFilters }: JobsEmptyStateProps) {
  const Icon = filtered ? SearchX : Inbox;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">
        {filtered ? "No requests found" : "No requests yet"}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        {filtered
          ? "No job requests match your current search and filters. Try a different term or widen the filters."
          : "Requests submitted through the landing page will show up here."}
      </p>
      {filtered ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
