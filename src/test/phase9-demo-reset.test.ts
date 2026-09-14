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
    expect(sql).toMatch(/pg_try_advisory_lock\(918273645\)/i);
    expect(sql).toMatch(/pg_advisory_unlock\(918273645\)/i);
    expect(sql).toMatch(/delete from public\.leads[\s\S]*where is_synthetic = true/i);
    expect(sql).toMatch(/@example\.com/i);
    expect(sql).not.toMatch(/\+7[\s(]?9/);
    expect(sql).toMatch(/grant execute on function public\.reset_demo_data/i);
    expect(sql).toMatch(/revoke all on function public\.reset_demo_data/i);
    expect(sql).toMatch(/transition_lead_status/i);
    expect(sql).not.toMatch(/external_event_id/);
    expect(sql).toMatch(/automation_attempt, created_at[\s\S]*'new', 'idle', 2, v_now - interval '5 days'/i);
    expect(sql).toMatch(
      /next_action_at = v_now - interval '2 days'[\s\S]*-- 10\. Additional active pipeline lead/i,
    );
  });

  it("ships rollback-safe SQL verification with survival, cascade, and privilege assertions", () => {
    const verifySql = readFileSync(
      join(process.cwd(), "supabase/verify/phase9_demo_reset.sql"),
      "utf8",
    );

    expect(verifySql).toMatch(/begin;/i);
    expect(verifySql).toMatch(/rollback;/i);
    expect(verifySql).toMatch(/repeated demo reset verification/i);
    expect(verifySql).toMatch(/pg_advisory_unlock\(918273645\)/i);
    expect(verifySql).toMatch(/fixture synthetic lead % must be deleted by reset/i);
    expect(verifySql).toMatch(/fixture synthetic history % must cascade on reset/i);
    expect(verifySql).toMatch(/fixture synthetic comment % must cascade on reset/i);
    expect(verifySql).toMatch(/fixture synthetic audit % must cascade on reset/i);
    expect(verifySql).toMatch(/non-synthetic lead % must survive reset/i);
    expect(verifySql).toMatch(/legacy jobs row % must survive reset/i);
    expect(verifySql).toMatch(/operator profile % must survive reset/i);
    expect(verifySql).toMatch(/auth user % must survive reset/i);
    expect(verifySql).toMatch(/repeated reset must not accumulate seed rows/i);
    expect(verifySql).toMatch(/repeated reset must issue a new demo_reset_group_id/i);
    expect(verifySql).toMatch(/rate-limit bucket fixture must survive reset/i);
    expect(verifySql).toMatch(/anon must not execute reset_demo_data/i);
    expect(verifySql).toMatch(/not an active operator/i);
    expect(verifySql).toMatch(/get_lead_metrics/i);
  });
});
