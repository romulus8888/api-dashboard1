import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("phase8 lead automation migration", () => {
  it("defines automation RPCs with pinned search_path and service_role-only execute", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260911200000_create_lead_automation_rpcs.sql"),
      "utf8",
    );

    expect(sql).toMatch(/create or replace function public\.claim_lead_for_processing/i);
    expect(sql).toMatch(/create or replace function public\.complete_lead_processing/i);
    expect(sql).toMatch(/create or replace function public\.fail_lead_processing/i);
    expect(sql).toMatch(/create or replace function public\.retry_lead_automation/i);
    expect(sql).toMatch(/set search_path = pg_catalog, pg_temp/i);
    expect(sql).toMatch(/grant execute on function public\.claim_lead_for_processing/i);
    expect(sql).toMatch(/revoke all on function public\.retry_lead_automation/i);
    expect(sql).toMatch(/lead\.created:%s:attempt:%s/);
  });

  it("ships rollback-safe SQL verification with claim, failure, retry, and privilege assertions", () => {
    const verifySql = readFileSync(
      join(process.cwd(), "supabase/verify/phase8_lead_automation.sql"),
      "utf8",
    );

    expect(verifySql).toMatch(/begin;/i);
    expect(verifySql).toMatch(/rollback;/i);
    expect(verifySql).toMatch(/expected first claim true/i);
    expect(verifySql).toMatch(/duplicate claim false/i);
    expect(verifySql).toMatch(/needs_review status history/i);
    expect(verifySql).toMatch(/failure before claim/i);
    expect(verifySql).toMatch(/second claim uses new key/i);
    expect(verifySql).toMatch(/failed received rows must remain/i);
    expect(verifySql).toMatch(/stale automation_state=processing/i);
  });
});
