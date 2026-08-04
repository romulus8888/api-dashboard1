import { ChevronRight, Loader2 } from "lucide-react";

import { PriorityBadge } from "@/components/job-badges";
import { JobStatusSelect } from "@/components/job-status-select";
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold tracking-wider text-slate-500 uppercase">
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
            <th scope="col" className="w-10 px-4 py-3">
              <span className="sr-only">View details</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {jobs.map((job) => (
            <JobsTableRow
              key={job.id}
              job={job}
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
  selected: boolean;
  updating: boolean;
  onSelectJob: (job: Job) => void;
  onStatusChange: (job: Job, status: JobStatus) => void;
}

function JobsTableRow({
  job,
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
        {/* Keyboard equivalent of the row click; the row handler covers pointer users. */}
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
        {formatCurrency(job.budget)}
      </td>
      <td className="px-4 py-3.5 align-top whitespace-nowrap text-slate-500">
        {formatDate(job.created_at)}
      </td>
      <td className="px-4 py-3.5 align-top">
        {/* Stops the inline status change from also opening the drawer. */}
        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
          <JobStatusSelect
            id={`status-${job.id}`}
            label={`Status for ${job.title}`}
            hideLabel
            size="sm"
            value={job.status}
            disabled={updating}
            onChange={(status) => onStatusChange(job, status)}
          />
          {updating ? (
            <Loader2 className="size-4 animate-spin text-slate-400" aria-label="Saving status" />
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3.5 align-top text-slate-300">
        <ChevronRight className="size-4" aria-hidden="true" />
      </td>
    </tr>
  );
}
