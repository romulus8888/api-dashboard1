import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("phase6 lost transition migration", () => {
  it("persists loss_reason inside transition_lead_status", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260911140000_atomic_lost_reason_in_transition.sql"),
      "utf8",
    );

    expect(sql).toMatch(/loss_reason = case/i);
    expect(sql).toMatch(/when p_to_status = 'lost'/i);
  });
});
