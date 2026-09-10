import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { AdminLeadsApiError, fetchAdminLeads, updateAdminLeadStatus } from "@/lib/admin/admin-leads-client";
import { useLeads } from "@/hooks/use-leads";
import type { LeadStatus } from "@/types/lead";

vi.mock("@/lib/admin/admin-leads-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/admin-leads-client")>();
  return {
    ...actual,
    fetchAdminLeads: vi.fn(),
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
  });

  it("clears loaded leads and notifies once when the initial list expires", async () => {
    vi.mocked(fetchAdminLeads).mockRejectedValue(new AdminLeadsApiError("session_expired", 401));
    const onSessionExpired = vi.fn();

    const { result } = renderHook(() => useLeads({ onSessionExpired }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.leads).toEqual([]);
    expect(result.current.loadError).toBeNull();
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

    await waitFor(() => {
      expect(result.current.leads).toEqual([]);
    });
    expect(result.current.loadError).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("rolls back optimistic status updates before handling session expiry", async () => {
    vi.mocked(fetchAdminLeads).mockResolvedValue([lead]);
    vi.mocked(updateAdminLeadStatus).mockRejectedValue(new AdminLeadsApiError("session_expired", 401));

    const onSessionExpired = vi.fn();
    const { result } = renderHook(() => useLeads({ onSessionExpired }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.updateStatus(lead, "contacted" as LeadStatus);

    await waitFor(() => {
      expect(result.current.leads).toEqual([]);
    });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });
});
