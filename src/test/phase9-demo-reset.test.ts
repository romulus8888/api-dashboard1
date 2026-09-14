import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("phase9 demo reset migration", () => {
  it("defines reset_demo_data with pinned search_path and service_role-only execute", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260912140000_create_reset_demo_data_rpc.sql"),
      "utf8",
    );

    expect(sql).toMatch(/create or replace function public\.reset_demo_data/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/i);
    expect(sql).toMatch(/validate_active_operator_assignment\(p_operator_id\)/i);
    expect(sql).toMatch(/pg_try_advisory_xact_lock\(918273645\)/i);
    expect(sql).toMatch(/delete from public\.leads[\s\S]*where is_synthetic = true/i);
    expect(sql).toMatch(/@example\.com/i);
    expect(sql).not.toMatch(/\+7[\s(]?9/);
    expect(sql).toMatch(/grant execute on function public\.reset_demo_data/i);
    expect(sql).toMatch(/revoke all on function public\.reset_demo_data/i);
    expect(sql).toMatch(/transition_lead_status/i);
    expect(sql).not.toMatch(/external_event_id/);
  });

  it("ships rollback-safe SQL verification with survival, cascade, and privilege assertions", () => {
    const verifySql = readFileSync(
      join(process.cwd(), "supabase/verify/phase9_demo_reset.sql"),
      "utf8",
    );

    expect(verifySql).toMatch(/begin;/i);
    expect(verifySql).toMatch(/rollback;/i);
    expect(verifySql).toMatch(/non-synthetic lead must survive reset/i);
    expect(verifySql).toMatch(/synthetic comments must cascade on reset/i);
    expect(verifySql).toMatch(/repeated reset must not accumulate seed rows/i);
    expect(verifySql).toMatch(/operators must survive reset/i);
    expect(verifySql).toMatch(/auth users must survive reset/i);
    expect(verifySql).toMatch(/rate-limit buckets must survive reset/i);
    expect(verifySql).toMatch(/anon must not execute reset_demo_data/i);
    expect(verifySql).toMatch(/not an active operator/i);
    expect(verifySql).toMatch(/get_lead_metrics/i);
  });
});
