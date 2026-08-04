import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  JOB_PRIORITY_LABELS,
  JOB_STATUS_LABELS,
  type JobPriority,
  type JobStatus,
} from "@/types/job";

export const STATUS_TONES: Record<JobStatus, BadgeTone> = {
  pending: "amber",
  in_progress: "indigo",
  completed: "emerald",
};

export const PRIORITY_TONES: Record<JobPriority, BadgeTone> = {
  low: "slate",
  medium: "amber",
  high: "rose",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {JOB_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: JobPriority }) {
  return <Badge tone={PRIORITY_TONES[priority]}>{JOB_PRIORITY_LABELS[priority]}</Badge>;
}
