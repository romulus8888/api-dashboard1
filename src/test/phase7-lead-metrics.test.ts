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
    expect(sql).toMatch(/count\(\*\) filter \(where reached_started\)/i);
    expect(sql).toMatch(/grant execute on function public\.get_lead_metrics/i);
    expect(sql).toMatch(/revoke all on function public\.get_lead_metrics/i);
  });

  it("includes rollback-safe verification", () => {
    const verifySql = readFileSync(
      join(process.cwd(), "supabase/verify/phase7_lead_metrics.sql"),
      "utf8",
    );

    expect(verifySql).toMatch(/begin;/i);
    expect(verifySql).toMatch(/rollback;/i);
    expect(verifySql).toMatch(/get_lead_metrics/i);
  });
});
