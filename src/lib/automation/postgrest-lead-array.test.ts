import { describe, expect, it } from "vitest";

import {
  expandPostgrestLeadArray,
  expandPostgrestN8nItems,
  isLeadPollingEligible,
} from "@/lib/automation/postgrest-lead-array";

const NEW_IDLE = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "new",
  automation_state: "idle",
  automation_attempt: 1,
} as const;

const REVIEW_IDLE = {
  id: "22222222-2222-4222-8222-222222222222",
  status: "needs_review",
  automation_state: "idle",
  automation_attempt: 2,
} as const;

describe("postgrest lead array expansion", () => {
  it("returns zero items for an empty PostgREST array", () => {
    expect(expandPostgrestLeadArray([])).toEqual([]);
  });

  it("returns one downstream lead id per returned row", () => {
    const leads = expandPostgrestLeadArray([NEW_IDLE, REVIEW_IDLE]);

    expect(leads.map((lead) => lead.id)).toEqual([NEW_IDLE.id, REVIEW_IDLE.id]);
  });

  it("unwraps a { leads: [...] } payload", () => {
    expect(expandPostgrestLeadArray({ leads: [NEW_IDLE, REVIEW_IDLE] }).map((lead) => lead.id)).toEqual([
      NEW_IDLE.id,
      REVIEW_IDLE.id,
    ]);
  });

  it("treats a single lead object as one item", () => {
    expect(expandPostgrestLeadArray(NEW_IDLE).map((lead) => lead.id)).toEqual([NEW_IDLE.id]);
  });

  it("unwraps numeric-key objects produced by some HTTP nodes", () => {
    expect(
      expandPostgrestLeadArray({ 0: NEW_IDLE, 1: REVIEW_IDLE }).map((lead) => lead.id),
    ).toEqual([NEW_IDLE.id, REVIEW_IDLE.id]);
  });

  it("expands n8n items when HTTP Request already split the JSON array", () => {
    const leads = expandPostgrestN8nItems([NEW_IDLE, REVIEW_IDLE]);

    expect(leads.map((lead) => lead.id)).toEqual([NEW_IDLE.id, REVIEW_IDLE.id]);
  });

  it("expands n8n items when the first item still holds the raw array", () => {
    expect(expandPostgrestN8nItems([[NEW_IDLE, REVIEW_IDLE]]).map((lead) => lead.id)).toEqual([
      NEW_IDLE.id,
      REVIEW_IDLE.id,
    ]);
  });

  it("returns zero n8n items when fetch produced an empty array", () => {
    expect(expandPostgrestN8nItems([[]])).toEqual([]);
    expect(expandPostgrestN8nItems([])).toEqual([]);
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
