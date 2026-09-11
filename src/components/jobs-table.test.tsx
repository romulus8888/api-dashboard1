import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { JobsTable } from "@/components/jobs-table";
import { LocaleProvider } from "@/i18n/locale-provider";
import { en } from "@/i18n/dictionaries/en";
import type { AdminLeadListItem } from "@/lib/admin/admin-leads-client";

const lead: AdminLeadListItem = {
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
  next_action_at: null,
  first_response_due_at: null,
  is_synthetic: true,
  created_at: "2026-09-10T12:00:00.000Z",
  updated_at: "2026-09-10T12:00:00.000Z",
};

describe("JobsTable", () => {
  it("does not offer lost in inline status controls", () => {
    render(
      <LocaleProvider locale="en" dictionary={en}>
        <JobsTable
          leads={[lead]}
          selectedLeadId={null}
          updatingLeadId={null}
          ownerNames={{}}
          onSelectLead={vi.fn()}
          onStatusChange={vi.fn()}
        />
      </LocaleProvider>,
    );

    const statusSelect = document.getElementById(`status-${lead.id}`) as HTMLSelectElement;
    const optionValues = Array.from(statusSelect.options).map((option) => option.value);

    expect(optionValues).not.toContain("lost");
    expect(screen.getByText(lead.title)).toBeTruthy();
  });
});
