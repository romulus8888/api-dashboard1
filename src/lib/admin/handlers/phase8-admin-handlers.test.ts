import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleRetryLeadAutomation } from "@/lib/admin/handlers/retry-lead-automation";
import { AuthError } from "@/lib/auth/errors";

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

function buildRetryRequest(path: string, body: unknown = {}, headers?: Record<string, string>): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      host: "localhost",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("phase 8 admin retry handler", () => {
  beforeEach(() => {
    requireActiveOperatorMock.mockReset();
    createServiceSupabaseClientMock.mockReset();
    logAdminErrorMock.mockReset();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    requireActiveOperatorMock.mockResolvedValue(operatorContext);
  });

  it("requires auth", async () => {
    requireActiveOperatorMock.mockRejectedValueOnce(new AuthError(401, "Unauthorized"));

    const response = await handleRetryLeadAutomation(
      LEAD_ID,
      buildRetryRequest(`/api/admin/leads/${LEAD_ID}/retry`),
    );

    expect(response.status).toBe(401);
    expect(createServiceSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects missing CSRF origin", async () => {
    const response = await handleRetryLeadAutomation(
      LEAD_ID,
      buildRetryRequest(`/api/admin/leads/${LEAD_ID}/retry`, {}, { origin: "http://evil.test" }),
    );

    expect(response.status).toBe(403);
    expect(createServiceSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects non-empty request bodies with extra fields", async () => {
    const response = await handleRetryLeadAutomation(
      LEAD_ID,
      buildRetryRequest(`/api/admin/leads/${LEAD_ID}/retry`, { force: true }),
    );

    expect(response.status).toBe(400);
    expect(createServiceSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("calls retry_lead_automation and returns refreshed lead detail", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: { id: LEAD_ID, automation_state: "idle", automation_attempt: 2 },
      error: null,
    });
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: { id: LEAD_ID, automation_state: "idle", automation_attempt: 2 },
      error: null,
    });

    createServiceSupabaseClientMock.mockReturnValue({
      rpc: rpcMock,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: maybeSingleMock,
          })),
        })),
      })),
    });

    const response = await handleRetryLeadAutomation(
      LEAD_ID,
      buildRetryRequest(`/api/admin/leads/${LEAD_ID}/retry`),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("retry_lead_automation", {
      p_lead_id: LEAD_ID,
      p_changed_by: OPERATOR_ID,
    });
    expect(payload.data.automation_attempt).toBe(2);
  });

  it("returns 409 for illegal automation retry states", async () => {
    createServiceSupabaseClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "retry_lead_automation: lead has stale automation_state=processing" },
      }),
    });

    const response = await handleRetryLeadAutomation(
      LEAD_ID,
      buildRetryRequest(`/api/admin/leads/${LEAD_ID}/retry`),
    );

    expect(response.status).toBe(409);
  });
});
