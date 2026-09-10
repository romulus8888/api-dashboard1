import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useLocaleContext } from "@/i18n/locale-provider";
import type { LeadPriority, LeadStatus } from "@/types/lead";

export const STATUS_TONES: Record<LeadStatus, BadgeTone> = {
  new: "amber",
  in_progress: "indigo",
  contacted: "indigo",
  qualified: "emerald",
  won: "emerald",
  lost: "rose",
  needs_review: "amber",
  archived: "slate",
  duplicate: "slate",
};

export const PRIORITY_TONES: Record<LeadPriority, BadgeTone> = {
  low: "slate",
  medium: "amber",
  high: "rose",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  const { dictionary } = useLocaleContext();

  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {dictionary.leads.status[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: LeadPriority }) {
  const { dictionary } = useLocaleContext();

  return <Badge tone={PRIORITY_TONES[priority]}>{dictionary.leads.priority[priority]}</Badge>;
}
