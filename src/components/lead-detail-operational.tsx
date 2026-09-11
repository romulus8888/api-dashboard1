"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  OverdueBadge,
  PriorityBadge,
  SourceBadge,
  StatusBadge,
  SyntheticBadge,
} from "@/components/job-badges";
import { JobStatusSelect } from "@/components/job-status-select";
import { Select } from "@/components/ui/select";
import {
  AdminLeadsApiError,
  createAdminLeadComment,
  fetchAdminLead,
  fetchAdminLeadComments,
  fetchAdminLeadHistory,
  retryAdminLeadAutomation,
  type AdminLeadDetail,
  type AdminLeadListItem,
  type AdminLeadPatchInput,
} from "@/lib/admin/admin-leads-client";
import { isDeadlineOverdue } from "@/lib/admin/lead-overdue";
import { isAdminSessionExpired } from "@/lib/auth/admin-session-expiry";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { ActiveOperatorOption, LeadComment, LeadPriority, LeadStatus, LeadStatusHistoryEntry } from "@/types/lead";
import { LEAD_PRIORITIES } from "@/types/lead";
import { useLocaleContext } from "@/i18n/locale-provider";

function toDateTimeLocalValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export interface LeadDetailOperationalProps {
  lead: AdminLeadListItem;
  operators: ActiveOperatorOption[];
  updating: boolean;
  patching: boolean;
  onSessionExpired: () => void;
  onStatusChange: (lead: AdminLeadListItem, status: LeadStatus, reason?: string) => Promise<void>;
  onPatchLead: (lead: AdminLeadListItem, patch: AdminLeadPatchInput) => Promise<AdminLeadDetail>;
}

export function LeadDetailOperational({
  lead,
  operators,
  updating,
  patching,
  onSessionExpired,
  onStatusChange,
  onPatchLead,
}: LeadDetailOperationalProps) {
  const { locale, dictionary } = useLocaleContext();
  const labels = dictionary.leads.detail;

  const [detail, setDetail] = useState<AdminLeadDetail | null>(null);
  const [history, setHistory] = useState<LeadStatusHistoryEntry[]>([]);
  const [comments, setComments] = useState<LeadComment[]>([]);
  const [loadedLeadId, setLoadedLeadId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const detailLoading = loadedLeadId !== lead.id;
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [pendingLostTransition, setPendingLostTransition] = useState(false);
  const [lossReasonDraft, setLossReasonDraft] = useState("");
  const [lossReasonError, setLossReasonError] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string>("");
  const [priority, setPriority] = useState<LeadPriority>(lead.priority);
  const [firstResponseDue, setFirstResponseDue] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [retryingAutomation, setRetryingAutomation] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      fetchAdminLead(lead.id),
      fetchAdminLeadHistory(lead.id),
      fetchAdminLeadComments(lead.id),
    ]).then(
      ([leadDetail, leadHistory, leadComments]) => {
        if (cancelled) return;
        setDetail(leadDetail);
        setHistory(leadHistory);
        setComments(leadComments);
        setOwnerId(leadDetail.owner_id ?? "");
        setPriority(leadDetail.priority);
        setFirstResponseDue(toDateTimeLocalValue(leadDetail.first_response_due_at));
        setNextActionAt(toDateTimeLocalValue(leadDetail.next_action_at));
        setPendingLostTransition(false);
        setLossReasonDraft("");
        setLossReasonError(null);
        setDetailError(null);
        setHistoryError(null);
        setCommentsError(null);
        setLoadedLeadId(lead.id);
      },
      (error: unknown) => {
        if (cancelled) return;
        if (isAdminSessionExpired(error)) {
          onSessionExpired();
          return;
        }
        setDetailError(dictionary.leads.error.loadFailed);
        setLoadedLeadId(lead.id);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [dictionary, lead.id, onSessionExpired]);

  const activeLead = detail ?? lead;
  const operatorOptions = useMemo(
    () => [
      { value: "", label: labels.noOwner },
      ...operators.map((operator) => ({ value: operator.id, label: operator.display_name })),
    ],
    [labels.noOwner, operators],
  );

  const priorityOptions = LEAD_PRIORITIES.map((value) => ({
    value,
    label: dictionary.leads.priority[value],
  }));

  const firstResponseOverdue = isDeadlineOverdue(activeLead.status, activeLead.first_response_due_at);
  const nextActionOverdue = isDeadlineOverdue(activeLead.status, activeLead.next_action_at);

  const handleSave = async () => {
    try {
      const updated = await onPatchLead(lead, {
        owner_id: ownerId || null,
        priority,
        first_response_due_at: fromDateTimeLocalValue(firstResponseDue),
        next_action_at: fromDateTimeLocalValue(nextActionAt),
      });
      setDetail(updated);
    } catch (error) {
      if (isAdminSessionExpired(error)) return;
      if (error instanceof AdminLeadsApiError && error.code === "conflict") {
        setDetailError(dictionary.leads.error.conflict);
        return;
      }
      setDetailError(dictionary.leads.error.patchFailed);
    }
  };

  const handleAddComment = async () => {
    const trimmed = commentBody.trim();
    if (!trimmed) return;

    setPostingComment(true);
    setCommentsError(null);

    try {
      const created = await createAdminLeadComment(lead.id, trimmed);
      setComments((current) => [...current, created]);
      setCommentBody("");
    } catch (error) {
      if (isAdminSessionExpired(error)) {
        onSessionExpired();
        return;
      }
      setCommentsError(dictionary.leads.error.commentFailed);
    } finally {
      setPostingComment(false);
    }
  };

  const refreshDetail = async () => {
    const [refreshed, leadHistory] = await Promise.all([
      fetchAdminLead(lead.id),
      fetchAdminLeadHistory(lead.id),
    ]);
    setDetail(refreshed);
    setHistory(leadHistory);
  };

  const handleRetryAutomation = async () => {
    if (retryingAutomation || detail?.automation_state !== "failed") {
      return;
    }

    setRetryingAutomation(true);
    setAutomationError(null);

    try {
      const updated = await retryAdminLeadAutomation(lead.id);
      setDetail(updated);
      const leadHistory = await fetchAdminLeadHistory(lead.id);
      setHistory(leadHistory);
    } catch (error) {
      if (isAdminSessionExpired(error)) {
        onSessionExpired();
        return;
      }

      if (error instanceof AdminLeadsApiError && error.code === "conflict") {
        setAutomationError(labels.automationRetryConflict);
        return;
      }

      setAutomationError(labels.automationRetryFailed);
    } finally {
      setRetryingAutomation(false);
    }
  };

  const handleStatusSelectChange = async (status: LeadStatus) => {
    if (status === "lost") {
      if (activeLead.status !== "lost") {
        setPendingLostTransition(true);
        setLossReasonDraft("");
        setLossReasonError(null);
      }
      return;
    }

    setPendingLostTransition(false);
    setLossReasonDraft("");
    setLossReasonError(null);

    if (status !== activeLead.status) {
      await onStatusChange(lead, status);
      await refreshDetail();
    }
  };

  const handleConfirmLost = async () => {
    const reason = lossReasonDraft.trim();
    if (!reason) {
      setLossReasonError(labels.lossReasonRequired);
      return;
    }

    setLossReasonError(null);
    await onStatusChange(lead, "lost", reason);
    setPendingLostTransition(false);
    setLossReasonDraft("");
    await refreshDetail();
  };

  if (detailLoading) {
    return <p className="text-sm text-slate-500">{labels.loading}</p>;
  }

  if (detailError && !detail) {
    return <p className="text-sm text-rose-600">{detailError}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {labels.syntheticNotice}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={activeLead.status} />
        <PriorityBadge priority={activeLead.priority} />
        <SourceBadge source={activeLead.source} />
        {activeLead.is_synthetic ? <SyntheticBadge /> : null}
        {firstResponseOverdue || nextActionOverdue ? <OverdueBadge /> : null}
      </div>

      <section>
        <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
          {labels.description}
        </h3>
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">
          {detail?.description ?? "—"}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <JobStatusSelect
          id={`drawer-status-${lead.id}`}
          label={labels.status}
          value={activeLead.status}
          disabled={updating}
          onChange={(status) => void handleStatusSelectChange(status)}
        />
        {pendingLostTransition ? (
          <div className="mt-4 space-y-3">
            <label htmlFor={`loss-reason-${lead.id}`} className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{labels.lossReason}</span>
              <textarea
                id={`loss-reason-${lead.id}`}
                value={lossReasonDraft}
                onChange={(event) => {
                  setLossReasonDraft(event.target.value);
                  if (lossReasonError) setLossReasonError(null);
                }}
                placeholder={labels.lossReasonPlaceholder}
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
              />
            </label>
            {lossReasonError ? <p className="text-sm text-rose-600">{lossReasonError}</p> : null}
            <button
              type="button"
              disabled={updating || !lossReasonDraft.trim()}
              onClick={() => void handleConfirmLost()}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {labels.confirmLost}
            </button>
          </div>
        ) : null}
        {activeLead.status === "lost" && detail?.loss_reason ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-3">
            <h4 className="text-sm font-medium text-slate-700">{labels.lossReason}</h4>
            <p className="mt-2 text-sm whitespace-pre-line text-slate-600">{detail.loss_reason}</p>
          </div>
        ) : null}
        {detail?.automation_state === "failed" ? (
          <div className="mt-4 space-y-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3">
            <h4 className="text-sm font-medium text-rose-900">{labels.automation}</h4>
            <p className="text-sm text-rose-800">{labels.automationFailed}</p>
            <button
              type="button"
              disabled={retryingAutomation}
              onClick={() => void handleRetryAutomation()}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {retryingAutomation ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {retryingAutomation ? labels.retryingAutomation : labels.retryAutomation}
            </button>
            {automationError ? <p className="text-sm text-rose-700">{automationError}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
        <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
          {labels.assignment}
        </h3>
        <Select
          id={`owner-${lead.id}`}
          label={labels.owner}
          value={ownerId}
          options={operatorOptions}
          onChange={setOwnerId}
        />
        <Select
          id={`priority-${lead.id}`}
          label={labels.priority}
          value={priority}
          options={priorityOptions}
          onChange={setPriority}
        />
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
        <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
          {labels.deadlines}
        </h3>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">{labels.firstResponseDue}</span>
          <input
            type="datetime-local"
            value={firstResponseDue}
            onChange={(event) => setFirstResponseDue(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">{labels.nextAction}</span>
          <input
            type="datetime-local"
            value={nextActionAt}
            onChange={(event) => setNextActionAt(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
          />
        </label>
        <button
          type="button"
          disabled={patching}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {patching ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {labels.saveChanges}
        </button>
        {detailError ? <p className="text-sm text-rose-600">{detailError}</p> : null}
      </section>

      <section>
        <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">{labels.details}</h3>
        <dl className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
          <DetailRow label={labels.contactName}>{activeLead.contact_name}</DetailRow>
          <DetailRow label={labels.contactEmail}>
            <a href={`mailto:${activeLead.contact_email}`} className="text-indigo-600 hover:underline">
              {activeLead.contact_email}
            </a>
          </DetailRow>
          <DetailRow label={labels.contactPhone}>{detail?.contact_phone ?? "—"}</DetailRow>
          <DetailRow label={labels.budget}>
            {formatCurrency(activeLead.budget_amount, locale, activeLead.budget_currency)}
          </DetailRow>
          <DetailRow label={labels.created}>{formatDateTime(activeLead.created_at, locale)}</DetailRow>
          <DetailRow label={labels.leadId}>
            <span className="font-mono text-xs break-all text-slate-500">{activeLead.id}</span>
          </DetailRow>
        </dl>
      </section>

      <section>
        <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">{labels.history}</h3>
        {historyError ? <p className="mt-2 text-sm text-rose-600">{historyError}</p> : null}
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{labels.historyEmpty}</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {history.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <div className="font-medium text-slate-900">
                  {entry.from_status
                    ? `${dictionary.leads.status[entry.from_status]} → ${dictionary.leads.status[entry.to_status]}`
                    : dictionary.leads.status[entry.to_status]}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatDateTime(entry.created_at, locale)} ·{" "}
                  {entry.changed_by_name ?? labels.historyActorSystem}
                </div>
                {entry.reason ? <p className="mt-1 text-slate-600">{entry.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">{labels.comments}</h3>
        {commentsError ? <p className="mt-2 text-sm text-rose-600">{commentsError}</p> : null}
        {comments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{labels.commentsEmpty}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <div className="font-medium text-slate-900">{comment.author_name}</div>
                <div className="text-xs text-slate-500">{formatDateTime(comment.created_at, locale)}</div>
                <p className="mt-1 whitespace-pre-line text-slate-700">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 space-y-2">
          <label htmlFor={`comment-${lead.id}`} className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{labels.commentLabel}</span>
            <textarea
              id={`comment-${lead.id}`}
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder={labels.commentPlaceholder}
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
            />
          </label>
          <button
            type="button"
            disabled={postingComment || !commentBody.trim()}
            onClick={() => void handleAddComment()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {postingComment ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {postingComment ? labels.postingComment : labels.addComment}
          </button>
        </div>
      </section>
    </div>
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
