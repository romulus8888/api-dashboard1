import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleCreateLeadComment } from "@/lib/admin/handlers/create-lead-comment";
import { handleGetLeadHistory } from "@/lib/admin/handlers/get-lead-history";
import { handleListLeadComments } from "@/lib/admin/handlers/list-lead-comments";
import { handleListOperators } from "@/lib/admin/handlers/list-operators";
import { handlePatchLead } from "@/lib/admin/handlers/patch-lead";
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

function buildMutationRequest(path: string, body: unknown, headers?: Record<string, string>): Request {
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

describe("phase 6 admin handlers", () => {
  beforeEach(() => {
    requireActiveOperatorMock.mockReset();
    createServiceSupabaseClientMock.mockReset();
    logAdminErrorMock.mockReset();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    requireActiveOperatorMock.mockResolvedValue(operatorContext);
  });

  it("lists active operators only", async () => {
    createServiceSupabaseClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [{ id: OPERATOR_ID, display_name: "Operator One" }],
              error: null,
            }),
          })),
        })),
      })),
    });

    const response = await handleListOperators();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(1);
  });

  it("patches only operational fields and returns 409 on stale updated_at", async () => {
    const updateMock = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
    }));

    createServiceSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "operator_profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: OPERATOR_ID }, error: null }),
                })),
              })),
            })),
          };
        }

        return { update: updateMock };
      }),
    });

    const response = await handlePatchLead(
      LEAD_ID,
      buildMutationRequest(`/api/admin/leads/${LEAD_ID}`, {
        priority: "high",
        updated_at: "2026-09-11T10:00:00.000Z",
      }),
    );

    expect(response.status).toBe(409);
    expect(updateMock).toHaveBeenCalledWith({ priority: "high" });
  });

  it("rejects cross-origin patch mutations", async () => {
    const response = await handlePatchLead(
      LEAD_ID,
      buildMutationRequest(
        `/api/admin/leads/${LEAD_ID}`,
        { priority: "high" },
        { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      ),
    );

    expect(response.status).toBe(403);
    expect(createServiceSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("returns ordered immutable history entries", async () => {
    createServiceSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: LEAD_ID }, error: null }),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "hist-2",
                    lead_id: LEAD_ID,
                    from_status: "new",
                    to_status: "in_progress",
                    changed_by: OPERATOR_ID,
                    change_source: "admin_api",
                    reason: null,
                    created_at: "2026-09-11T12:00:00.000Z",
                    operator_profiles: { display_name: "Operator One" },
                  },
                ],
                error: null,
              }),
            })),
          })),
        };
      }),
    });

    const response = await handleGetLeadHistory(LEAD_ID);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[0].changed_by_name).toBe("Operator One");
  });

  it("creates comments with the verified operator as author", async () => {
    const insertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "comment-1",
            lead_id: LEAD_ID,
            author_id: OPERATOR_ID,
            body: "Internal note",
            created_at: "2026-09-11T12:00:00.000Z",
            updated_at: "2026-09-11T12:00:00.000Z",
            operator_profiles: { display_name: "Operator One" },
          },
          error: null,
        }),
      })),
    }));

    createServiceSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: LEAD_ID }, error: null }),
              })),
            })),
          };
        }

        return { insert: insertMock };
      }),
    });

    const forged = await handleCreateLeadComment(
      LEAD_ID,
      buildMutationRequest(`/api/admin/leads/${LEAD_ID}/comments`, {
        body: "note",
        author_id: "99999999-9999-4999-8999-999999999999",
      }),
    );
    expect(forged.status).toBe(400);

    const response = await handleCreateLeadComment(
      LEAD_ID,
      buildMutationRequest(`/api/admin/leads/${LEAD_ID}/comments`, { body: "Internal note" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith({
      lead_id: LEAD_ID,
      author_id: OPERATOR_ID,
      body: "Internal note",
    });
    expect(payload.data.author_id).toBe(OPERATOR_ID);
  });

  it("lists comments in chronological order", async () => {
    createServiceSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: LEAD_ID }, error: null }),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "comment-1",
                    lead_id: LEAD_ID,
                    author_id: OPERATOR_ID,
                    body: "First",
                    created_at: "2026-09-11T10:00:00.000Z",
                    updated_at: "2026-09-11T10:00:00.000Z",
                    operator_profiles: { display_name: "Operator One" },
                  },
                ],
                error: null,
              }),
            })),
          })),
        };
      }),
    });

    const response = await handleListLeadComments(LEAD_ID);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data[0].body).toBe("First");
  });

  it("uses RPC only for lost transitions without a follow-up loss_reason update", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: { id: LEAD_ID, status: "lost", loss_reason: "Budget" },
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
              data: { id: LEAD_ID, status: "lost", loss_reason: "Budget" },
              error: null,
            }),
          })),
        })),
      })),
    });

    const response = await handleTransitionLeadStatus(
      LEAD_ID,
      buildMutationRequest(`/api/admin/leads/${LEAD_ID}/status`, {
        status: "lost",
        reason: "Budget",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("transition_lead_status", {
      p_lead_id: LEAD_ID,
      p_to_status: "lost",
      p_change_source: "admin_api",
      p_changed_by: OPERATOR_ID,
      p_reason: "Budget",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });
});
