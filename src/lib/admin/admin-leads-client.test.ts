import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AdminLeadsApiError,
  fetchAdminLeads,
  updateAdminLeadStatus,
} from "@/lib/admin/admin-leads-client";

const lead = {
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
  is_synthetic: true,
  created_at: "2026-09-10T12:00:00.000Z",
  updated_at: "2026-09-10T12:00:00.000Z",
};

describe("admin leads client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists leads through the admin API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [lead],
          pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        }),
        { status: 200 },
      ),
    );

    await expect(fetchAdminLeads()).resolves.toEqual([lead]);
  });

  it("maps 401 responses to session_expired", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );

    await expect(fetchAdminLeads()).rejects.toMatchObject({
      code: "session_expired",
      status: 401,
    });
  });

  it("updates lead status through the admin API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { ...lead, status: "contacted" } }), { status: 200 }),
    );

    const updated = await updateAdminLeadStatus(lead.id, "contacted");

    expect(updated.status).toBe("contacted");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/admin/leads/${lead.id}/status`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ status: "contacted" }),
      }),
    );
  });

  it("never includes forged changed_by in the request body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { ...lead, status: "contacted" } }), { status: 200 }),
    );

    await updateAdminLeadStatus(lead.id, "contacted");

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ status: "contacted" });
  });
});

describe("AdminLeadsApiError", () => {
  it("exposes stable error codes", () => {
    const error = new AdminLeadsApiError("session_expired", 401);
    expect(error.code).toBe("session_expired");
    expect(error.status).toBe(401);
  });
});
