import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import {
  AdminLeadsApiError,
  fetchAdminLeads,
  patchAdminLead,
  updateAdminLeadStatus,
} from "@/lib/admin/admin-leads-client";
import { useLeads } from "@/hooks/use-leads";
import type { LeadStatus } from "@/types/lead";

vi.mock("@/lib/admin/admin-leads-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/admin-leads-client")>();
  return {
    ...actual,
    fetchAdminLeads: vi.fn(),
    updateAdminLeadStatus: vi.fn(),
    patchAdminLead: vi.fn(),
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
  budget_amount: 12000,
  budget_currency: "USD",
  owner_id: null,
  is_synthetic: true,
  created_at: "2026-09-10T12:00:00.000Z",
  updated_at: "2026-09-10T12:00:00.000Z",
};

describe("useLeads", () => {
  beforeEach(() => {
    vi.mocked(fetchAdminLeads).mockReset();
    vi.mocked(updateAdminLeadStatus).mockReset();
    vi.mocked(patchAdminLead).mockReset();
  });

  it("clears loaded leads and notifies once when the initial list expires", async () => {
    vi.mocked(fetchAdminLeads).mockRejectedValue(new AdminLeadsApiError("session_expired", 401));
    const onSessionExpired = vi.fn();

    const { result } = renderHook(() => useLeads({ onSessionExpired }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("clears loaded leads on refresh expiry without setting a load error", async () => {
    vi.mocked(fetchAdminLeads)
      .mockResolvedValueOnce([lead])
      .mockRejectedValueOnce(new AdminLeadsApiError("session_expired", 401));

    const onSessionExpired = vi.fn();
    const { result } = renderHook(() => useLeads({ onSessionExpired }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.refresh();

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("rolls back, notifies, and rejects when a session-expired status update fails", async () => {
    const sessionError = new AdminLeadsApiError("session_expired", 401);
    vi.mocked(fetchAdminLeads).mockResolvedValue([lead]);
    vi.mocked(updateAdminLeadStatus).mockRejectedValue(sessionError);

    const onSessionExpired = vi.fn();
    const { result } = renderHook(() => useLeads({ onSessionExpired }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(
      result.current.updateStatus(lead, "contacted" as LeadStatus),
    ).rejects.toBe(sessionError);

    await waitFor(() => {
      expect(result.current.leads[0]?.status).toBe("new");
    });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("rolls back and rejects when a non-session status update fails", async () => {
    const requestError = new AdminLeadsApiError("request_failed", 500);
    vi.mocked(fetchAdminLeads).mockResolvedValue([lead]);
    vi.mocked(updateAdminLeadStatus).mockRejectedValue(requestError);

    const onSessionExpired = vi.fn();
    const { result } = renderHook(() => useLeads({ onSessionExpired }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(
      result.current.updateStatus(lead, "contacted" as LeadStatus),
    ).rejects.toBe(requestError);

    await waitFor(() => {
      expect(result.current.leads[0]?.status).toBe("new");
    });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("rolls back and notifies when a session-expired patch fails", async () => {
    const sessionError = new AdminLeadsApiError("session_expired", 401);
    vi.mocked(fetchAdminLeads).mockResolvedValue([lead]);
    vi.mocked(patchAdminLead).mockRejectedValue(sessionError);

    const onSessionExpired = vi.fn();
    const { result } = renderHook(() => useLeads({ onSessionExpired }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(
      result.current.patchLead(lead, { priority: "high" }),
    ).rejects.toBe(sessionError);

    await waitFor(() => {
      expect(result.current.leads[0]?.priority).toBe("medium");
    });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("rolls back optimistic priority on conflict without session expiry", async () => {
    const conflictError = new AdminLeadsApiError("conflict", 409);
    vi.mocked(fetchAdminLeads).mockResolvedValue([lead]);
    vi.mocked(patchAdminLead).mockRejectedValue(conflictError);

    const onSessionExpired = vi.fn();
    const { result } = renderHook(() => useLeads({ onSessionExpired }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(
      result.current.patchLead(lead, { priority: "high" }),
    ).rejects.toBe(conflictError);

    await waitFor(() => {
      expect(result.current.leads[0]?.priority).toBe("medium");
    });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});
