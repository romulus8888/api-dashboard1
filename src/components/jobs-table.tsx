import { ChevronRight, Loader2 } from "lucide-react";

import { PriorityBadge } from "@/components/job-badges";
import { JobStatusSelect } from "@/components/job-status-select";
import type { Dictionary } from "@/i18n/dictionaries/types";
import { useLocaleContext } from "@/i18n/locale-provider";
import type { Locale } from "@/i18n/config";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Job, JobStatus } from "@/types/job";

export interface JobsTableProps {
  jobs: Job[];
  selectedJobId: string | null;
  updatingJobId: string | null;
  onSelectJob: (job: Job) => void;
  onStatusChange: (job: Job, status: JobStatus) => void;
}

export function JobsTable({
  jobs,
  selectedJobId,
  updatingJobId,
  onSelectJob,
  onStatusChange,
}: JobsTableProps) {
  const { locale, dictionary } = useLocaleContext();
  const labels = dictionary.jobs.table;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold tracking-wider text-slate-500 uppercase">
            <th scope="col" className="px-4 py-3">{labels.job}</th>
            <th scope="col" className="px-4 py-3">{labels.client}</th>
            <th scope="col" className="px-4 py-3">{labels.priority}</th>
            <th scope="col" className="px-4 py-3 text-right">{labels.budget}</th>
            <th scope="col" className="px-4 py-3">{labels.created}</th>
            <th scope="col" className="px-4 py-3">{labels.status}</th>
            <th scope="col" className="w-10 px-4 py-3">
              <span className="sr-only">{labels.viewDetails}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {jobs.map((job) => (
            <JobsTableRow
              key={job.id}
              job={job}
              locale={locale}
              labels={labels}
              selected={job.id === selectedJobId}
              updating={job.id === updatingJobId}
              onSelectJob={onSelectJob}
              onStatusChange={onStatusChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface JobsTableRowProps {
  job: Job;
  locale: Locale;
  labels: Dictionary["jobs"]["table"];
  selected: boolean;
  updating: boolean;
  onSelectJob: (job: Job) => void;
  onStatusChange: (job: Job, status: JobStatus) => void;
}

function JobsTableRow({
  job,
  locale,
  labels,
  selected,
  updating,
  onSelectJob,
  onStatusChange,
}: JobsTableRowProps) {
  return (
    <tr
      onClick={() => onSelectJob(job)}
      className={cn(
        "cursor-pointer transition hover:bg-slate-50",
        selected && "bg-indigo-50/60 hover:bg-indigo-50/60",
      )}
    >
      <td className="max-w-sm px-4 py-3.5 align-top">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectJob(job);
          }}
          className="rounded text-left font-medium text-slate-900 transition hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {job.title}
        </button>
        <p className="mt-0.5 line-clamp-2 text-slate-500">{job.description}</p>
      </td>
      <td className="px-4 py-3.5 align-top text-slate-600">{job.client_email}</td>
      <td className="px-4 py-3.5 align-top">
        <PriorityBadge priority={job.priority} />
      </td>
      <td className="px-4 py-3.5 text-right align-top font-medium text-slate-900 tabular-nums">
        {formatCurrency(job.budget, locale, "USD")}
      </td>
      <td className="px-4 py-3.5 align-top whitespace-nowrap text-slate-500">
        {formatDate(job.created_at, locale)}
      </td>
      <td className="px-4 py-3.5 align-top">
        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
          <JobStatusSelect
            id={`status-${job.id}`}
            label={labels.statusFor.replace("{title}", job.title)}
            hideLabel
            size="sm"
            value={job.status}
            disabled={updating}
            onChange={(status) => onStatusChange(job, status)}
          />
          {updating ? (
            <Loader2
              className="size-4 animate-spin text-slate-400"
              aria-label={labels.savingStatus}
            />
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3.5 align-top text-slate-300">
        <ChevronRight className="size-4" aria-hidden="true" />
      </td>
    </tr>
  );
}
