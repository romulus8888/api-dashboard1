"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { PriorityBadge, StatusBadge } from "@/components/job-badges";
import { JobStatusSelect } from "@/components/job-status-select";
import { Drawer } from "@/components/ui/drawer";
import { useLocaleContext } from "@/i18n/locale-provider";
import {
  fetchAdminLead,
  type AdminLeadDetail,
  type AdminLeadListItem,
} from "@/lib/admin/admin-leads-client";
import { isAdminSessionExpired } from "@/lib/auth/admin-session-expiry";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { LeadStatus } from "@/types/lead";

export interface JobDetailDrawerProps {
  lead: AdminLeadListItem | null;
  updating: boolean;
  onClose: () => void;
  onSessionExpired: () => void;
  onStatusChange: (lead: AdminLeadListItem, status: LeadStatus) => Promise<void>;
}

export function JobDetailDrawer(props: JobDetailDrawerProps) {
  if (!props.lead) return null;
  return <JobDetailDrawerContent key={props.lead.id} {...props} lead={props.lead} />;
}

function JobDetailDrawerContent({
  lead,
  updating,
  onClose,
  onSessionExpired,
  onStatusChange,
}: JobDetailDrawerProps & { lead: AdminLeadListItem }) {
  const { locale, dictionary } = useLocaleContext();
  const labels = dictionary.leads.detail;
  const [detail, setDetail] = useState<AdminLeadDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void fetchAdminLead(lead.id).then(
      (data) => {
        if (cancelled) return;
        setDetail(data);
        setDetailLoading(false);
      },
      (error: unknown) => {
        if (cancelled) return;

        if (isAdminSessionExpired(error)) {
          onSessionExpired();
          return;
        }

        setDetailError(dictionary.leads.error.loadFailed);
        setDetailLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [dictionary, lead.id, onSessionExpired]);

  const activeLead = detail ?? lead;

  const nextStep =
    activeLead.status === "new"
      ? { status: "in_progress" as const, label: labels.startProgress }
      : activeLead.status === "in_progress"
        ? { status: "contacted" as const, label: labels.markContacted }
        : null;

  return (
    <Drawer
      open
      onClose={onClose}
      title={activeLead.title}
      closePanelLabel={dictionary.accessibility.closePanel}
      description={labels.submittedBy.replace("{email}", activeLead.contact_email)}
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
              {updating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {nextStep.label}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={activeLead.status} />
          <PriorityBadge priority={activeLead.priority} />
        </div>

        {detailLoading ? (
          <p className="text-sm text-slate-500">{dictionary.leads.detail.saving}</p>
        ) : detailError ? (
          <p className="text-sm text-rose-600">{detailError}</p>
        ) : (
          <section>
            <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              {labels.description}
            </h3>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">
              {detail?.description ?? "—"}
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <JobStatusSelect
            id={`drawer-status-${lead.id}`}
            label={labels.status}
            value={activeLead.status}
            disabled={updating}
            onChange={(status) => void onStatusChange(lead, status)}
          />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            {updating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                {labels.saving}
              </>
            ) : (
              labels.changesSaveImmediately
            )}
          </p>
        </section>

        <section>
          <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
            {labels.details}
          </h3>
          <dl className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
            <DetailRow label={labels.contactName}>{activeLead.contact_name}</DetailRow>
            <DetailRow label={labels.contactEmail}>
              <a
                href={`mailto:${activeLead.contact_email}`}
                className="text-indigo-600 transition hover:text-indigo-500 hover:underline"
              >
                {activeLead.contact_email}
              </a>
            </DetailRow>
            <DetailRow label={labels.budget}>
              <span className="font-medium tabular-nums">
                {formatCurrency(activeLead.budget_amount, locale, activeLead.budget_currency)}
              </span>
            </DetailRow>
            <DetailRow label={labels.created}>{formatDateTime(activeLead.created_at, locale)}</DetailRow>
            <DetailRow label={labels.leadId}>
              <span className="font-mono text-xs break-all text-slate-500">{activeLead.id}</span>
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
