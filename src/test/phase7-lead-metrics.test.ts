import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("phase7 lead metrics migration", () => {
  it("defines get_lead_metrics with service_role-only execute", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260911180000_create_lead_metrics_rpc.sql"),
      "utf8",
    );

    expect(sql).toMatch(/create or replace function public\.get_lead_metrics/i);
    expect(sql).toMatch(/security invoker/i);
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/i);
    expect(sql).toMatch(/grant execute on function public\.get_lead_metrics/i);
    expect(sql).toMatch(/revoke all on function public\.get_lead_metrics/i);
  });

  it("ships rollback-safe SQL verification with value assertions", () => {
    const verifySql = readFileSync(
      join(process.cwd(), "supabase/verify/phase7_lead_metrics.sql"),
      "utf8",
    );

    expect(verifySql).toMatch(/begin;/i);
    expect(verifySql).toMatch(/rollback;/i);
    expect(verifySql).toMatch(/expected received=2/i);
    expect(verifySql).toMatch(/funnel milestones must be monotonic/i);
    expect(verifySql).toMatch(/source totals must reconcile/i);
    expect(verifySql).toMatch(/empty cohort must return null conversion/i);
    expect(verifySql).toMatch(/empty cohort must still return current overdue snapshot/i);
    expect(verifySql).toMatch(/expected first_action average_seconds=3600/i);
    expect(verifySql).toMatch(/expected first_terminal average_seconds=259200/i);
  });
});
