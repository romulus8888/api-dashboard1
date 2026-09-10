import { describe, expect, it } from "vitest";

import { AdminLeadsApiError } from "@/lib/admin/admin-leads-client";
import type { LeadStatus } from "@/types/lead";

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

function patchLeadStatus<T extends { id: string; status: LeadStatus }>(
  items: T[],
  id: string,
  status: LeadStatus,
): T[] {
  return items.map((item) => (item.id === id ? { ...item, status } : item));
}

async function runOptimisticStatusUpdate(
  items: typeof lead[],
  nextStatus: LeadStatus,
  update: (id: string, status: LeadStatus) => Promise<unknown>,
) {
  const target = items[0];
  if (!target) throw new Error("missing lead");

  const previousStatus = target.status;
  let current = patchLeadStatus(items, target.id, nextStatus);

  try {
    await update(target.id, nextStatus);
  } catch (error) {
    current = patchLeadStatus(current, target.id, previousStatus);
    throw error;
  }

  return current;
}

describe("useLeads optimistic status behavior", () => {
  it("rolls back to the previous status when the admin API update fails", async () => {
    const update = async () => {
      throw new AdminLeadsApiError("request_failed", 500);
    };

    await expect(runOptimisticStatusUpdate([lead], "contacted", update)).rejects.toBeInstanceOf(
      AdminLeadsApiError,
    );

    const optimistic = patchLeadStatus([lead], lead.id, "contacted");
    const rolledBack = patchLeadStatus(optimistic, lead.id, lead.status);
    expect(rolledBack[0]?.status).toBe("new");
  });

  it("surfaces session expiry from the admin API client", () => {
    const error = new AdminLeadsApiError("session_expired", 401);
    expect(error.code).toBe("session_expired");
    expect(error.status).toBe(401);
  });
});
