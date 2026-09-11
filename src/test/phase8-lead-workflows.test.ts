import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  POSTGREST_LEAD_ARRAY_CODE,
  expandPostgrestLeadArray,
} from "@/lib/automation/postgrest-lead-array";

function readWorkflow(name: string) {
  return JSON.parse(
    readFileSync(join(process.cwd(), "automation/workflows", name), "utf8"),
  ) as {
    name: string;
    active: boolean;
    nodes: Array<{ name: string; type: string; parameters?: Record<string, unknown> }>;
    connections: Record<string, { main: Array<Array<{ node: string }>> }>;
  };
}

describe("phase8 lead n8n workflows", () => {
  it("keeps lead intake polling inactive with PostgREST array expansion and eligibility filters", () => {
    const workflow = readWorkflow("supabase-lead-intake-polling.json");
    const serialized = JSON.stringify(workflow);
    const expandNode = workflow.nodes.find((node) => node.name === "Expand PostgREST lead array");

    expect(workflow.active).toBe(false);
    expect(workflow.name).toMatch(/lead intake/i);
    expect(serialized).toContain("YOUR_PROJECT_REF");
    expect(serialized).not.toMatch(/service_role|eyJ[a-zA-Z0-9_-]+\./);
    expect(serialized).toContain("claim_lead_for_processing");
    expect(serialized).toContain("transition_lead_status");
    expect(serialized).toContain("complete_lead_processing");
    expect(serialized).toContain("in.(new,needs_review)");
    expect(serialized).not.toContain("fieldToSplitOut");
    expect(expandNode?.type).toBe("n8n-nodes-base.code");
    expect(expandNode?.parameters?.jsCode).toBe(POSTGREST_LEAD_ARRAY_CODE);

    const fixture = expandPostgrestLeadArray([
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

    expect(fixture.map((lead) => lead.id)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(expandPostgrestLeadArray([])).toEqual([]);

    expect(workflow.connections["Supabase — fetch eligible leads"].main[0][0].node).toBe(
      "Expand PostgREST lead array",
    );
    expect(workflow.connections["Expand PostgREST lead array"].main[0][0].node).toBe(
      "Supabase — claim lead processing",
    );
  });

  it("keeps lead error handler inactive with parallel Telegram and fail RPC", () => {
    const workflow = readWorkflow("supabase-lead-intake-error-handler.json");

    expect(workflow.active).toBe(false);
    expect(JSON.stringify(workflow)).toContain("YOUR_PROJECT_REF");
    expect(JSON.stringify(workflow)).toContain("YOUR_TELEGRAM_CHAT_ID");
    expect(JSON.stringify(workflow)).toContain("fail_lead_processing");
    expect(JSON.stringify(workflow)).not.toMatch(/service_role|bot[0-9]+:/i);

    const triggerConnections = workflow.connections["Error Trigger"].main[0];

    expect(triggerConnections.map((edge) => edge.node)).toEqual([
      "Supabase — fail lead processing",
      "Telegram — notify lead intake failure",
    ]);
  });
});
