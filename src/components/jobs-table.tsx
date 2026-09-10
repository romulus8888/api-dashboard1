import { ChevronRight, Loader2 } from "lucide-react";

import { PriorityBadge } from "@/components/job-badges";
import { JobStatusSelect } from "@/components/job-status-select";
import type { Dictionary } from "@/i18n/dictionaries/types";
import { useLocaleContext } from "@/i18n/locale-provider";
import type { Locale } from "@/i18n/config";
import type { AdminLeadListItem } from "@/lib/admin/admin-leads-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/types/lead";

export interface JobsTableProps {
  leads: AdminLeadListItem[];
  selectedLeadId: string | null;
  updatingLeadId: string | null;
  onSelectLead: (lead: AdminLeadListItem) => void;
  onStatusChange: (lead: AdminLeadListItem, status: LeadStatus) => void;
}

export function JobsTable({
  leads,
  selectedLeadId,
  updatingLeadId,
  onSelectLead,
  onStatusChange,
}: JobsTableProps) {
  const { locale, dictionary } = useLocaleContext();
  const labels = dictionary.leads.table;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold tracking-wider text-slate-500 uppercase">
            <th scope="col" className="px-4 py-3">{labels.lead}</th>
            <th scope="col" className="px-4 py-3">{labels.contact}</th>
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
          {leads.map((lead) => (
            <JobsTableRow
              key={lead.id}
              lead={lead}
              locale={locale}
              labels={labels}
              selected={lead.id === selectedLeadId}
              updating={lead.id === updatingLeadId}
              onSelectLead={onSelectLead}
              onStatusChange={onStatusChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface JobsTableRowProps {
  lead: AdminLeadListItem;
  locale: Locale;
  labels: Dictionary["leads"]["table"];
  selected: boolean;
  updating: boolean;
  onSelectLead: (lead: AdminLeadListItem) => void;
  onStatusChange: (lead: AdminLeadListItem, status: LeadStatus) => void;
}

function JobsTableRow({
  lead,
  locale,
  labels,
  selected,
  updating,
  onSelectLead,
  onStatusChange,
}: JobsTableRowProps) {
  return (
    <tr
      onClick={() => onSelectLead(lead)}
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
            onSelectLead(lead);
          }}
          className="rounded text-left font-medium text-slate-900 transition hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {lead.title}
        </button>
      </td>
      <td className="px-4 py-3.5 align-top text-slate-600">
        <div>{lead.contact_name}</div>
        <div className="text-slate-500">{lead.contact_email}</div>
      </td>
      <td className="px-4 py-3.5 align-top">
        <PriorityBadge priority={lead.priority} />
      </td>
      <td className="px-4 py-3.5 text-right align-top font-medium text-slate-900 tabular-nums">
        {formatCurrency(lead.budget_amount, locale, lead.budget_currency)}
      </td>
      <td className="px-4 py-3.5 align-top whitespace-nowrap text-slate-500">
        {formatDate(lead.created_at, locale)}
      </td>
      <td className="px-4 py-3.5 align-top">
        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
          <JobStatusSelect
            id={`status-${lead.id}`}
            label={labels.statusFor.replace("{title}", lead.title)}
            hideLabel
            size="sm"
            value={lead.status}
            disabled={updating}
            onChange={(status) => onStatusChange(lead, status)}
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
