import { describe, expect, it } from "vitest";

import { leadPatchSchema } from "@/lib/admin/lead-update-schema";

describe("leadPatchSchema", () => {
  it("accepts operational field updates", () => {
    const parsed = leadPatchSchema.parse({
      owner_id: "11111111-1111-4111-8111-111111111111",
      priority: "high",
      next_action_at: "2026-09-11T12:00:00.000Z",
      first_response_due_at: null,
      updated_at: "2026-09-11T10:00:00.000Z",
    });

    expect(parsed.priority).toBe("high");
  });

  it("rejects empty patches and forged fields", () => {
    expect(() => leadPatchSchema.parse({})).toThrow();
    expect(() => leadPatchSchema.parse({ status: "won" })).toThrow();
  });
});
