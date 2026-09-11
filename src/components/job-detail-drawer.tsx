"use client";

import { LeadDetailOperational } from "@/components/lead-detail-operational";
import { Drawer } from "@/components/ui/drawer";
import { useLocaleContext } from "@/i18n/locale-provider";
import type { AdminLeadDetail, AdminLeadListItem, AdminLeadPatchInput } from "@/lib/admin/admin-leads-client";
import type { ActiveOperatorOption, LeadStatus } from "@/types/lead";

export interface JobDetailDrawerProps {
  lead: AdminLeadListItem | null;
  operators: ActiveOperatorOption[];
  updating: boolean;
  patching: boolean;
  onClose: () => void;
  onSessionExpired: () => void;
  onStatusChange: (lead: AdminLeadListItem, status: LeadStatus, reason?: string) => Promise<void>;
  onPatchLead: (lead: AdminLeadListItem, patch: AdminLeadPatchInput) => Promise<AdminLeadDetail>;
}

export function JobDetailDrawer(props: JobDetailDrawerProps) {
  if (!props.lead) return null;
  return <JobDetailDrawerContent key={props.lead.id} {...props} lead={props.lead} />;
}

function JobDetailDrawerContent({
  lead,
  operators,
  updating,
  patching,
  onClose,
  onSessionExpired,
  onStatusChange,
  onPatchLead,
}: JobDetailDrawerProps & { lead: AdminLeadListItem }) {
  const { dictionary } = useLocaleContext();
  const labels = dictionary.leads.detail;

  const nextStep =
    lead.status === "new"
      ? { status: "in_progress" as const, label: labels.startProgress }
      : lead.status === "in_progress"
        ? { status: "contacted" as const, label: labels.markContacted }
        : null;

  return (
    <Drawer
      open
      onClose={onClose}
      title={lead.title}
      closePanelLabel={dictionary.accessibility.closePanel}
      description={labels.submittedBy.replace("{email}", lead.contact_email)}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            {labels.close}
          </button>
          {nextStep ? (
            <button
              type="button"
              disabled={updating}
              onClick={() => void onStatusChange(lead, nextStep.status)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {nextStep.label}
            </button>
          ) : null}
        </div>
      }
    >
      <LeadDetailOperational
        lead={lead}
        operators={operators}
        updating={updating}
        patching={patching}
        onSessionExpired={onSessionExpired}
        onStatusChange={onStatusChange}
        onPatchLead={onPatchLead}
      />
    </Drawer>
  );
}
