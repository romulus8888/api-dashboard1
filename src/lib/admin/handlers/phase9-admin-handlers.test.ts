import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleResetDemoData } from "@/lib/admin/handlers/reset-demo-data";
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

const operatorContext = {
  userId: OPERATOR_ID,
  operator: {
    id: OPERATOR_ID,
    display_name: "Operator One",
    is_active: true,
  },
};

function buildResetRequest(body: unknown = { confirm: "reset-synthetic-demo" }, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/admin/demo/reset", {
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

describe("phase 9 admin demo reset handler", () => {
  beforeEach(() => {
    requireActiveOperatorMock.mockReset();
    createServiceSupabaseClientMock.mockReset();
    logAdminErrorMock.mockReset();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    requireActiveOperatorMock.mockResolvedValue(operatorContext);
  });

  it("requires auth", async () => {
    requireActiveOperatorMock.mockRejectedValueOnce(new AuthError(401, "Unauthorized"));

    const response = await handleResetDemoData(buildResetRequest());

    expect(response.status).toBe(401);
    expect(createServiceSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects missing CSRF origin", async () => {
    const response = await handleResetDemoData(
      buildResetRequest({ confirm: "reset-synthetic-demo" }, { origin: "http://evil.test" }),
    );

    expect(response.status).toBe(403);
    expect(createServiceSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects invalid confirmation payloads", async () => {
    const response = await handleResetDemoData(buildResetRequest({ confirm: "yes" }));

    expect(response.status).toBe(400);
    expect(createServiceSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects extra fields in the request body", async () => {
    const response = await handleResetDemoData(
      buildResetRequest({ confirm: "reset-synthetic-demo", force: true }),
    );

    expect(response.status).toBe(400);
    expect(createServiceSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("calls reset_demo_data with the verified operator id", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: {
        demo_reset_group_id: "33333333-3333-4333-8333-333333333333",
        deleted_count: 10,
        inserted_count: 10,
      },
      error: null,
    });
    createServiceSupabaseClientMock.mockReturnValue({ rpc: rpcMock });

    const response = await handleResetDemoData(buildResetRequest());
    const payload = (await response.json()) as {
      data: { demo_reset_group_id: string; deleted_count: number; inserted_count: number };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(rpcMock).toHaveBeenCalledWith("reset_demo_data", { p_operator_id: OPERATOR_ID });
    expect(payload.data.inserted_count).toBe(10);
  });

  it("maps concurrent reset conflicts to 409", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "reset_demo_data: another reset is already in progress" },
    });
    createServiceSupabaseClientMock.mockReturnValue({ rpc: rpcMock });

    const response = await handleResetDemoData(buildResetRequest());

    expect(response.status).toBe(409);
  });

  it("maps inactive operator RPC errors to 403", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "not an active operator" },
    });
    createServiceSupabaseClientMock.mockReturnValue({ rpc: rpcMock });

    const response = await handleResetDemoData(buildResetRequest());

    expect(response.status).toBe(403);
  });
});
