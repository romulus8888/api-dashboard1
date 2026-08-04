import { AlertCircle, RefreshCw } from "lucide-react";

export interface JobsErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function JobsErrorState({ message, onRetry }: JobsErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">
        Couldn&apos;t load job requests
      </h3>
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
