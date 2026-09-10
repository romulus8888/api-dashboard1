import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useLocaleContext } from "@/i18n/locale-provider";
import type { JobPriority, JobStatus } from "@/types/job";

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
  const { dictionary } = useLocaleContext();

  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {dictionary.jobs.status[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: JobPriority }) {
  const { dictionary } = useLocaleContext();

  return <Badge tone={PRIORITY_TONES[priority]}>{dictionary.jobs.priority[priority]}</Badge>;
}
