import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleGetLead } from "@/lib/admin/handlers/get-lead";
import { handleListLeads } from "@/lib/admin/handlers/list-leads";
import { handleTransitionLeadStatus } from "@/lib/admin/handlers/transition-lead-status";

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

const OPERATOR_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";

const operatorContext = {
  userId: OPERATOR_ID,
  operator: {
    id: OPERATOR_ID,
    display_name: "Operator One",
    is_active: true,
  },
};

function buildStatusRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request(
    `http://localhost/api/admin/leads/${LEAD_ID}/status`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        host: "localhost",
        "sec-fetch-site": "same-origin",
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
}

describe("admin lead handlers", () => {
  beforeEach(() => {
    requireActiveOperatorMock.mockReset();
    createServiceSupabaseClientMock.mockReset();
    logAdminErrorMock.mockReset();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("returns 401 when unauthenticated", async () => {
    const { AuthError } = await import("@/lib/auth/errors");
    requireActiveOperatorMock.mockRejectedValue(new AuthError(401, "Unauthorized"));

    const response = await handleListLeads(new Request("http://localhost/api/admin/leads"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when operator is inactive or missing", async () => {
    const { AuthError } = await import("@/lib/auth/errors");
    requireActiveOperatorMock.mockRejectedValue(new AuthError(403, "Forbidden"));

    const response = await handleGetLead("22222222-2222-2222-2222-222222222222");

    expect(response.status).toBe(403);
  });

  it("lists leads for authorized operators", async () => {
    requireActiveOperatorMock.mockResolvedValue(operatorContext);
    createServiceSupabaseClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            range: vi.fn().mockResolvedValue({
              data: [{ id: "lead-1", title: "Demo" }],
              error: null,
              count: 1,
            }),
          })),
        })),
      })),
    });

    const response = await handleListLeads(new Request("http://localhost/api/admin/leads"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload.data).toHaveLength(1);
    expect(payload.pagination.total).toBe(1);
  });

  it("returns lead detail for authorized operators", async () => {
    requireActiveOperatorMock.mockResolvedValue(operatorContext);
    createServiceSupabaseClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: LEAD_ID, title: "Lead" },
              error: null,
            }),
          })),
        })),
      })),
    });

    const response = await handleGetLead(LEAD_ID);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.id).toBe(LEAD_ID);
  });

  it("rejects invalid lead ids and status payloads", async () => {
    requireActiveOperatorMock.mockResolvedValue(operatorContext);

    const invalidIdResponse = await handleGetLead("not-a-uuid");
    expect(invalidIdResponse.status).toBe(400);

    const invalidStatusResponse = await handleTransitionLeadStatus(
      LEAD_ID,
      buildStatusRequest({ status: "bogus" }),
    );
    expect(invalidStatusResponse.status).toBe(400);
  });

  it("uses the verified operator id for status transitions and rejects forged changed_by", async () => {
    requireActiveOperatorMock.mockResolvedValue(operatorContext);

    const rpcMock = vi.fn().mockResolvedValue({
      data: { id: LEAD_ID, status: "contacted" },
      error: null,
    });

    const updateMock = vi.fn();

    createServiceSupabaseClientMock.mockReturnValue({
      rpc: rpcMock,
      from: vi.fn(() => ({
        update: updateMock,
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: LEAD_ID, status: "contacted" },
              error: null,
            }),
          })),
        })),
      })),
    });

    const forgedBodyResponse = await handleTransitionLeadStatus(
      LEAD_ID,
      buildStatusRequest({
        status: "contacted",
        changed_by: "99999999-9999-4999-8999-999999999999",
      }),
    );
    expect(forgedBodyResponse.status).toBe(400);

    const response = await handleTransitionLeadStatus(
      LEAD_ID,
      buildStatusRequest({ status: "contacted", reason: "Follow up" }),
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("transition_lead_status", {
      p_lead_id: LEAD_ID,
      p_to_status: "contacted",
      p_change_source: "admin_api",
      p_changed_by: operatorContext.operator.id,
      p_reason: "Follow up",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin status mutations", async () => {
    requireActiveOperatorMock.mockResolvedValue(operatorContext);

    const response = await handleTransitionLeadStatus(
      LEAD_ID,
      buildStatusRequest(
        { status: "contacted" },
        {
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        },
      ),
    );

    expect(response.status).toBe(403);
    expect(createServiceSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("sanitizes internal errors and never returns service_role details", async () => {
    requireActiveOperatorMock.mockResolvedValue(operatorContext);
    createServiceSupabaseClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            range: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "service_role key invalid for table leads" },
              count: null,
            }),
          })),
        })),
      })),
    });

    const response = await handleListLeads(new Request("http://localhost/api/admin/leads"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe("Unable to process request.");
    expect(JSON.stringify(payload)).not.toMatch(/service_role/i);
    expect(logAdminErrorMock).toHaveBeenCalled();
  });
});
