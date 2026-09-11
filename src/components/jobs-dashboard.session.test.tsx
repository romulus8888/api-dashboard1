import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { JobsDashboardContent } from "@/components/jobs-dashboard";
import { LocaleProvider } from "@/i18n/locale-provider";
import { en } from "@/i18n/dictionaries/en";
import {
  AdminLeadsApiError,
  fetchAdminLead,
  fetchAdminLeads,
  fetchAdminOperators,
  updateAdminLeadStatus,
} from "@/lib/admin/admin-leads-client";

const mockReplace = vi.fn();
const mockToast = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

vi.mock("@/components/ui/toast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/toast")>();
  return {
    ...actual,
    useToast: () => ({
      toast: mockToast,
      dismiss: vi.fn(),
    }),
  };
});

vi.mock("@/lib/admin/admin-leads-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/admin-leads-client")>();
  return {
    ...actual,
    fetchAdminLeads: vi.fn(),
    fetchAdminLead: vi.fn(),
    fetchAdminOperators: vi.fn(),
    updateAdminLeadStatus: vi.fn(),
  };
});

const lead = {
  id: "22222222-2222-4222-8222-222222222222",
  status: "new" as const,
  priority: "medium" as const,
  source: "demo_seed" as const,
  locale: "en" as const,
  contact_name: "Alex Rivera",
  contact_email: "alex.rivera@example.demo",
  title: "Migrate billing API to v2",
  description: "Need a phased rollout with zero downtime.",
  budget_amount: 12000,
  budget_currency: "USD",
  owner_id: null,
  is_synthetic: true,
  created_at: "2026-09-10T12:00:00.000Z",
  updated_at: "2026-09-10T12:00:00.000Z",
};

function renderDashboard() {
  return render(
    <LocaleProvider locale="en" dictionary={en}>
      <JobsDashboardContent loadingLabel="Loading leads…" />
    </LocaleProvider>,
  );
}

describe("JobsDashboard session expiry", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.mocked(fetchAdminLeads).mockReset();
    vi.mocked(fetchAdminLead).mockReset();
    vi.mocked(fetchAdminOperators).mockReset();
    vi.mocked(updateAdminLeadStatus).mockReset();
    vi.mocked(fetchAdminOperators).mockResolvedValue([]);
    mockReplace.mockReset();
    mockToast.mockReset();
  });

  it("suppresses toasts when a session-expired status update rolls back and rejects", async () => {
    vi.mocked(fetchAdminLeads).mockResolvedValue([lead]);
    vi.mocked(updateAdminLeadStatus).mockRejectedValue(
      new AdminLeadsApiError("session_expired", 401),
    );

    renderDashboard();

    await screen.findByText(lead.title);

    const statusSelect = document.getElementById(`status-${lead.id}`) as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: "contacted" } });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledTimes(1);
    });

    expect(mockToast).not.toHaveBeenCalled();
    expect(screen.queryByText(lead.title)).toBeNull();
  });

  it("shows an error toast when a non-session status update fails", async () => {
    vi.mocked(fetchAdminLeads).mockResolvedValue([lead]);
    vi.mocked(updateAdminLeadStatus).mockRejectedValue(
      new AdminLeadsApiError("request_failed", 500),
    );

    renderDashboard();

    await screen.findByText(lead.title);

    const statusSelect = document.getElementById(`status-${lead.id}`) as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: "contacted" } });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "error",
          title: en.leads.toasts.statusUpdateFailedTitle,
        }),
      );
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: lead.title })).toBeTruthy();
  });

  it("clears the drawer and loaded leads when detail fetch expires", async () => {
    vi.mocked(fetchAdminLeads).mockResolvedValue([lead]);
    vi.mocked(fetchAdminLead).mockRejectedValue(new AdminLeadsApiError("session_expired", 401));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: lead.title }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: lead.title })[0]!);

    await waitFor(() => {
      expect(fetchAdminLead).toHaveBeenCalledWith(lead.id);
      expect(mockReplace).toHaveBeenCalledTimes(1);
    });

    expect(mockReplace).toHaveBeenCalledWith("/en/login?returnTo=%2Fen%2Fdashboard");
    expect(mockToast).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText(en.leads.empty.noneTitle)).toBeTruthy();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
