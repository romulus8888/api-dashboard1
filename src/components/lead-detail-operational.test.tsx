import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LeadDetailOperational } from "@/components/lead-detail-operational";
import { LocaleProvider } from "@/i18n/locale-provider";
import { en } from "@/i18n/dictionaries/en";
import { ru } from "@/i18n/dictionaries/ru";
import {
  AdminLeadsApiError,
  createAdminLeadComment,
  fetchAdminLead,
  fetchAdminLeadComments,
  fetchAdminLeadHistory,
  retryAdminLeadAutomation,
  type AdminLeadDetail,
  type AdminLeadListItem,
} from "@/lib/admin/admin-leads-client";

vi.mock("@/lib/admin/admin-leads-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/admin-leads-client")>();
  return {
    ...actual,
    fetchAdminLead: vi.fn(),
    fetchAdminLeadHistory: vi.fn(),
    fetchAdminLeadComments: vi.fn(),
    createAdminLeadComment: vi.fn(),
    retryAdminLeadAutomation: vi.fn(),
  };
});

const lead: AdminLeadListItem = {
  id: "22222222-2222-4222-8222-222222222222",
  status: "new",
  priority: "medium",
  source: "demo_seed",
  locale: "en",
  contact_name: "Alex Rivera",
  contact_email: "alex.rivera@example.demo",
  title: "Migrate billing API to v2",
  budget_amount: 12000,
  budget_currency: "USD",
  owner_id: null,
  next_action_at: null,
  first_response_due_at: null,
  is_synthetic: true,
  created_at: "2026-09-10T12:00:00.000Z",
  updated_at: "2026-09-10T12:00:00.000Z",
};

const detailBase: AdminLeadDetail = {
  ...lead,
  contact_phone: null,
  description: "Need a phased rollout with zero downtime.",
  won_at: null,
  lost_at: null,
  loss_reason: null,
  duplicate_of_lead_id: null,
  demo_reset_group_id: null,
  automation_state: "idle",
  automation_attempt: 1,
};

function renderDetail(
  props: Partial<{
    lead: AdminLeadListItem;
    onStatusChange: typeof vi.fn;
  }> = {},
  locale: "en" | "ru" = "en",
) {
  const dictionary = locale === "ru" ? ru : en;
  const onStatusChange = vi.fn().mockResolvedValue(undefined);
  const onPatchLead = vi.fn();
  const onSessionExpired = vi.fn();

  render(
    <LocaleProvider locale={locale} dictionary={dictionary}>
      <LeadDetailOperational
        lead={lead}
        operators={[]}
        updating={false}
        patching={false}
        onSessionExpired={onSessionExpired}
        onStatusChange={onStatusChange}
        onPatchLead={onPatchLead}
        {...props}
      />
    </LocaleProvider>,
  );

  return { onStatusChange, onPatchLead, onSessionExpired };
}

describe("LeadDetailOperational", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.mocked(fetchAdminLead).mockReset();
    vi.mocked(fetchAdminLeadHistory).mockReset();
    vi.mocked(fetchAdminLeadComments).mockReset();
    vi.mocked(createAdminLeadComment).mockReset();
    vi.mocked(retryAdminLeadAutomation).mockReset();
    vi.mocked(fetchAdminLeadHistory).mockResolvedValue([]);
    vi.mocked(fetchAdminLeadComments).mockResolvedValue([]);
  });

  it("shows localized loading copy while detail data is loading", async () => {
    vi.mocked(fetchAdminLead).mockImplementation(
      () => new Promise(() => undefined),
    );

    renderDetail({}, "ru");

    expect(screen.getByText(ru.leads.detail.loading)).toBeTruthy();
    expect(screen.queryByText(ru.leads.detail.saving)).toBeNull();
  });

  it("associates the comment textarea with a visible localized label", async () => {
    vi.mocked(fetchAdminLead).mockResolvedValue(detailBase);

    renderDetail({}, "en");

    await screen.findByLabelText(en.leads.detail.commentLabel);
    expect(screen.getByPlaceholderText(en.leads.detail.commentPlaceholder)).toBeTruthy();
  });

  it(
    "requires a drawer confirm flow before submitting lost",
    async () => {
    vi.mocked(fetchAdminLead).mockResolvedValue(detailBase);

    const { onStatusChange } = renderDetail();

    await screen.findByLabelText(en.leads.detail.commentLabel);

    const statusSelect = document.getElementById(`drawer-status-${lead.id}`) as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: "lost" } });

    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: en.leads.detail.confirmLost })).toBeTruthy();

    const lossReasonInput = document.getElementById(`loss-reason-${lead.id}`) as HTMLTextAreaElement;
    fireEvent.change(lossReasonInput, { target: { value: "Budget constraints" } });

    const confirmButton = screen.getByRole("button", {
      name: en.leads.detail.confirmLost,
    }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(false);
    fireEvent.click(confirmButton);

    await waitFor(
      () => {
        expect(onStatusChange).toHaveBeenCalledWith(lead, "lost", "Budget constraints");
      },
      { timeout: 5000 },
    );
    },
    15_000,
  );

  it("shows retry automation only for failed automation_state and refreshes detail/history", async () => {
    vi.mocked(fetchAdminLead).mockResolvedValue({
      ...detailBase,
      automation_state: "failed",
      status: "needs_review",
    });
    vi.mocked(retryAdminLeadAutomation).mockResolvedValue({
      ...detailBase,
      automation_state: "idle",
      automation_attempt: 2,
    });
    vi.mocked(fetchAdminLeadHistory).mockResolvedValue([
      {
        id: "33333333-3333-4333-8333-333333333333",
        lead_id: lead.id,
        from_status: "in_progress",
        to_status: "needs_review",
        changed_by: null,
        change_source: "automation",
        reason: "timeout",
        created_at: "2026-09-11T12:00:00.000Z",
      },
    ]);

    renderDetail();

    const retryButton = await screen.findByRole("button", { name: en.leads.detail.retryAutomation });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(retryAdminLeadAutomation).toHaveBeenCalledWith(lead.id);
      expect(screen.getByText("In progress → Needs review")).toBeTruthy();
    });
  });

  it("prevents duplicate retry clicks and surfaces conflict errors", async () => {
    vi.mocked(fetchAdminLead).mockResolvedValue({
      ...detailBase,
      automation_state: "failed",
      status: "needs_review",
    });
    vi.mocked(retryAdminLeadAutomation).mockRejectedValue(new AdminLeadsApiError("conflict", 409));

    renderDetail();

    const retryButton = await screen.findByRole("button", { name: en.leads.detail.retryAutomation });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(retryAdminLeadAutomation).toHaveBeenCalledTimes(1);
      expect(screen.getByText(en.leads.detail.automationRetryConflict)).toBeTruthy();
    });
  });

  it("shows an existing loss reason read-only for already-lost leads", async () => {
    vi.mocked(fetchAdminLead).mockResolvedValue({
      ...detailBase,
      status: "lost",
      loss_reason: "Chose another vendor",
      lost_at: "2026-09-11T12:00:00.000Z",
    });

    renderDetail({ lead: { ...lead, status: "lost" } });

    await screen.findByText("Chose another vendor");

    expect(document.getElementById(`loss-reason-${lead.id}`)).toBeNull();
    expect(screen.queryByRole("button", { name: en.leads.detail.confirmLost })).toBeNull();
  });
});
