import { Loader2 } from "lucide-react";

import { PriorityBadge, StatusBadge } from "@/components/job-badges";
import { JobStatusSelect } from "@/components/job-status-select";
import { Drawer } from "@/components/ui/drawer";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { Job, JobStatus } from "@/types/job";

const NEXT_STEPS: Partial<Record<JobStatus, { status: JobStatus; label: string }>> = {
  pending: { status: "in_progress", label: "Start progress" },
  in_progress: { status: "completed", label: "Mark completed" },
};

export interface JobDetailDrawerProps {
  /** The drawer is open whenever a job is provided. */
  job: Job | null;
  updating: boolean;
  onClose: () => void;
  onStatusChange: (job: Job, status: JobStatus) => void;
}

export function JobDetailDrawer({
  job,
  updating,
  onClose,
  onStatusChange,
}: JobDetailDrawerProps) {
  if (!job) return null;

  const nextStep = NEXT_STEPS[job.status];

  return (
    <Drawer
      open
      onClose={onClose}
      title={job.title}
      description={`Submitted by ${job.client_email}`}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            Close
          </button>
          {nextStep ? (
            <button
              type="button"
              disabled={updating}
              onClick={() => onStatusChange(job, nextStep.status)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {nextStep.label}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status} />
          <PriorityBadge priority={job.priority} />
        </div>

        <section>
          <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
            Description
          </h3>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">
            {job.description}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <JobStatusSelect
            id={`drawer-status-${job.id}`}
            label="Status"
            value={job.status}
            disabled={updating}
            onChange={(status) => onStatusChange(job, status)}
          />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            {updating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Changes save immediately."
            )}
          </p>
        </section>

        <section>
          <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
            Details
          </h3>
          <dl className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
            <DetailRow label="Client email">
              <a
                href={`mailto:${job.client_email}`}
                className="text-indigo-600 transition hover:text-indigo-500 hover:underline"
              >
                {job.client_email}
              </a>
            </DetailRow>
            <DetailRow label="Budget">
              <span className="font-medium tabular-nums">{formatCurrency(job.budget)}</span>
            </DetailRow>
            <DetailRow label="Created">{formatDateTime(job.created_at)}</DetailRow>
            <DetailRow label="Request ID">
              <span className="font-mono text-xs break-all text-slate-500">{job.id}</span>
            </DetailRow>
          </dl>
        </section>
      </div>
    </Drawer>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-slate-900">{children}</dd>
    </div>
  );
}
