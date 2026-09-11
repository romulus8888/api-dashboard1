import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "@/lib/auth/errors";
import { handleGetLeadMetrics } from "@/lib/admin/handlers/get-lead-metrics";

const {
  requireActiveOperatorMock,
  createServiceSupabaseClientMock,
  logAdminErrorMock,
} = vi.hoisted(() => ({
  requireActiveOperatorMock: vi.fn(),
  createServiceSupabaseClientMock: vi.fn(),
  logAdminErrorMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-active-operator", () => ({
  requireActiveOperator: requireActiveOperatorMock,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: createServiceSupabaseClientMock,
}));

vi.mock("@/lib/admin/safe-log", () => ({
  logAdminError: logAdminErrorMock,
}));

const sampleMetrics = {
  range: {
    from: "2026-08-12T00:00:00.000Z",
    to: "2026-09-11T00:00:00.000Z",
    as_of: "2026-09-11T12:00:00.000Z",
  },
  funnel: { received: 5, started: 4, contacted: 3, qualified: 2, won: 1 },
  conversion: {
    overall: 0.2,
    received_to_started: 0.8,
    started_to_contacted: 0.75,
    contacted_to_qualified: 0.6667,
    qualified_to_won: 0.5,
  },
  sources: [{ source: "demo_seed", received: 5, won: 1, conversion: 0.2 }],
  timing: {
    first_action: { average_seconds: 3600, median_seconds: 1800, sample_size: 4 },
    first_terminal: { average_seconds: 86400, median_seconds: 72000, sample_size: 2 },
  },
  overdue: { first_response: 1, next_action: 2, total: 3 },
};

describe("phase 7 admin metrics handler", () => {
  beforeEach(() => {
    requireActiveOperatorMock.mockReset();
    createServiceSupabaseClientMock.mockReset();
    logAdminErrorMock.mockReset();
    requireActiveOperatorMock.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      operator: { id: "11111111-1111-4111-8111-111111111111", display_name: "Op", is_active: true },
    });
  });

  it("requires active-operator auth", async () => {
    requireActiveOperatorMock.mockRejectedValue(new AuthError(401, "Unauthorized"));

    const response = await handleGetLeadMetrics(new Request("http://localhost/api/admin/metrics"));
    expect(response.status).toBe(401);
  });

  it("returns metrics from the RPC with default range", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: sampleMetrics, error: null });
    createServiceSupabaseClientMock.mockReturnValue({ rpc: rpcMock });

    const response = await handleGetLeadMetrics(new Request("http://localhost/api/admin/metrics"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.funnel.received).toBe(5);
    expect(rpcMock).toHaveBeenCalledWith(
      "get_lead_metrics",
      expect.objectContaining({
        p_from: expect.any(String),
        p_to: expect.any(String),
        p_as_of: expect.any(String),
      }),
    );
  });

  it("rejects invalid date ranges", async () => {
    const response = await handleGetLeadMetrics(
      new Request(
        "http://localhost/api/admin/metrics?from=2026-09-10T00:00:00.000Z&to=2026-09-01T00:00:00.000Z",
      ),
    );

    expect(response.status).toBe(400);
    expect(createServiceSupabaseClientMock).not.toHaveBeenCalled();
  });
});
