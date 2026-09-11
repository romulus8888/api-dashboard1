import { describe, expect, it } from "vitest";

import {
  expandPostgrestLeadArray,
  isLeadPollingEligible,
} from "@/lib/automation/postgrest-lead-array";

describe("postgrest lead array expansion", () => {
  it("returns zero items for an empty PostgREST array", () => {
    expect(expandPostgrestLeadArray([])).toEqual([]);
  });

  it("returns one downstream lead id per returned row", () => {
    const leads = expandPostgrestLeadArray([
      {
        id: "11111111-1111-4111-8111-111111111111",
        status: "new",
        automation_state: "idle",
        automation_attempt: 1,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        status: "needs_review",
        automation_state: "idle",
        automation_attempt: 2,
      },
    ]);

    expect(leads.map((lead) => lead.id)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("polls new+idle and needs_review+idle, but not failed needs_review leads", () => {
    expect(
      isLeadPollingEligible({ status: "new", automation_state: "idle" }),
    ).toBe(true);
    expect(
      isLeadPollingEligible({ status: "needs_review", automation_state: "idle" }),
    ).toBe(true);
    expect(
      isLeadPollingEligible({ status: "needs_review", automation_state: "failed" }),
    ).toBe(false);
  });
});
