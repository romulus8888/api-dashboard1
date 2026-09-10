import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("phase5 jobs lockdown migration", () => {
  it("enables RLS and revokes browser roles from public.jobs", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260910180000_lockdown_legacy_jobs.sql"),
      "utf8",
    );

    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.jobs from anon/i);
    expect(sql).toMatch(/revoke all on table public\.jobs from authenticated/i);
    expect(sql).toMatch(/rollback note/i);
  });

  it("includes static privilege verification", () => {
    const verifySql = readFileSync(
      join(process.cwd(), "supabase/verify/phase5_jobs_lockdown.sql"),
      "utf8",
    );

    expect(verifySql).toMatch(/has_table_privilege\('anon', 'public\.jobs', 'SELECT'\)/);
    expect(verifySql).toMatch(/has_table_privilege\('authenticated', 'public\.jobs', 'SELECT'\)/);
  });
});
