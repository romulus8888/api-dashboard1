import { CheckCircle2, CircleDashed, Inbox, Timer } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useLocaleContext } from "@/i18n/locale-provider";
import type { AdminLeadListItem } from "@/lib/admin/admin-leads-client";
import { cn } from "@/lib/utils";

type StatIcon = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export interface JobsStatsProps {
  leads: AdminLeadListItem[];
  loading: boolean;
}

export function JobsStats({ leads, loading }: JobsStatsProps) {
  const { dictionary } = useLocaleContext();
  const labels = dictionary.leads.stats;

  const cards: { label: string; value: number; icon: StatIcon; accent: string }[] = [
    {
      label: labels.total,
      value: leads.length,
      icon: Inbox,
      accent: "text-slate-500 bg-slate-100",
    },
    {
      label: labels.new,
      value: leads.filter((lead) => lead.status === "new").length,
      icon: CircleDashed,
      accent: "text-amber-600 bg-amber-50",
    },
    {
      label: labels.inProgress,
      value: leads.filter((lead) => lead.status === "in_progress").length,
      icon: Timer,
      accent: "text-indigo-600 bg-indigo-50",
    },
    {
      label: labels.won,
      value: leads.filter((lead) => lead.status === "won").length,
      icon: CheckCircle2,
      accent: "text-emerald-600 bg-emerald-50",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, accent }) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <span className={cn("flex size-8 items-center justify-center rounded-lg", accent)}>
              <Icon className="size-4" aria-hidden={true} />
            </span>
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-14" />
          ) : (
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {value}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
