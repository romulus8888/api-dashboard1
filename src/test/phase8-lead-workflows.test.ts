import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readWorkflow(name: string) {
  return JSON.parse(
    readFileSync(join(process.cwd(), "automation/workflows", name), "utf8"),
  ) as {
    name: string;
    active: boolean;
    nodes: Array<{ parameters?: Record<string, unknown> }>;
  };
}

describe("phase8 lead n8n workflows", () => {
  it("keeps lead intake polling inactive with placeholders and no secrets", () => {
    const workflow = readWorkflow("supabase-lead-intake-polling.json");

    expect(workflow.active).toBe(false);
    expect(workflow.name).toMatch(/lead intake/i);
    expect(JSON.stringify(workflow)).toContain("YOUR_PROJECT_REF");
    expect(JSON.stringify(workflow)).not.toMatch(/service_role|eyJ[a-zA-Z0-9_-]+\./);
    expect(JSON.stringify(workflow)).toContain("claim_lead_for_processing");
    expect(JSON.stringify(workflow)).toContain("transition_lead_status");
    expect(JSON.stringify(workflow)).toContain("complete_lead_processing");
    expect(JSON.stringify(workflow)).toContain("Split lead results");
  });

  it("keeps lead error handler inactive with parallel Telegram and fail RPC", () => {
    const workflow = readWorkflow("supabase-lead-intake-error-handler.json");

    expect(workflow.active).toBe(false);
    expect(JSON.stringify(workflow)).toContain("YOUR_PROJECT_REF");
    expect(JSON.stringify(workflow)).toContain("YOUR_TELEGRAM_CHAT_ID");
    expect(JSON.stringify(workflow)).toContain("fail_lead_processing");
    expect(JSON.stringify(workflow)).not.toMatch(/service_role|bot[0-9]+:/i);

    const triggerConnections = (workflow as {
      connections: Record<string, { main: Array<Array<{ node: string }>> }>;
    }).connections["Error Trigger"].main[0];

    expect(triggerConnections.map((edge) => edge.node)).toEqual([
      "Supabase — fail lead processing",
      "Telegram — notify lead intake failure",
    ]);
  });
});
