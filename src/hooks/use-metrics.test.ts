import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { AdminLeadsApiError, fetchAdminMetrics } from "@/lib/admin/admin-leads-client";
import { useMetrics } from "@/hooks/use-metrics";

vi.mock("@/lib/admin/admin-leads-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/admin-leads-client")>();
  return {
    ...actual,
    fetchAdminMetrics: vi.fn(),
  };
});

const metrics = {
  range: {
    from: "2026-08-12T00:00:00.000Z",
    to: "2026-09-11T00:00:00.000Z",
    as_of: "2026-09-11T12:00:00.000Z",
  },
  funnel: { received: 1, started: 1, contacted: 1, qualified: 1, won: 0 },
  conversion: {
    overall: 0,
    received_to_started: 1,
    started_to_contacted: 1,
    contacted_to_qualified: 1,
    qualified_to_won: 0,
  },
  sources: [],
  timing: {
    first_action: { average_seconds: null, median_seconds: null, sample_size: 0 },
    first_terminal: { average_seconds: null, median_seconds: null, sample_size: 0 },
  },
  overdue: { first_response: 0, next_action: 0, total: 0 },
};

describe("useMetrics", () => {
  beforeEach(() => {
    vi.mocked(fetchAdminMetrics).mockReset();
  });

  it("clears metrics and notifies once when the initial fetch expires", async () => {
    vi.mocked(fetchAdminMetrics).mockRejectedValue(new AdminLeadsApiError("session_expired", 401));
    const onSessionExpired = vi.fn();

    const { result } = renderHook(() => useMetrics({ onSessionExpired }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(result.current.metrics).toBeNull();
  });

  it("loads metrics independently from leads", async () => {
    vi.mocked(fetchAdminMetrics).mockResolvedValue(metrics);

    const { result } = renderHook(() => useMetrics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.metrics?.funnel.received).toBe(1);
  });
});
