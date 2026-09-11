import { describe, expect, it } from "vitest";

import {
  leadStatusTransitionSchema,
  MAX_STATUS_REASON_LENGTH,
} from "@/lib/admin/lead-status-schema";

describe("leadStatusTransitionSchema", () => {
  it("requires a non-blank reason when transitioning to lost", () => {
    expect(() => leadStatusTransitionSchema.parse({ status: "lost" })).toThrow();
    expect(() => leadStatusTransitionSchema.parse({ status: "lost", reason: "   " })).toThrow();
  });

  it("rejects oversized lost reasons", () => {
    expect(() =>
      leadStatusTransitionSchema.parse({
        status: "lost",
        reason: "x".repeat(MAX_STATUS_REASON_LENGTH + 1),
      }),
    ).toThrow();
  });

  it("accepts a bounded lost reason", () => {
    const parsed = leadStatusTransitionSchema.parse({ status: "lost", reason: "Budget constraints" });
    expect(parsed.reason).toBe("Budget constraints");
  });

  it("allows other transitions without a reason", () => {
    expect(leadStatusTransitionSchema.parse({ status: "contacted" }).status).toBe("contacted");
  });
});
