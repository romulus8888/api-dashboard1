import { describe, expect, it } from "vitest";

import { isDeadlineOverdue, isTerminalLeadStatus } from "@/lib/admin/lead-overdue";

describe("lead overdue helpers", () => {
  it("treats won, lost, archived, and duplicate as terminal", () => {
    expect(isTerminalLeadStatus("won")).toBe(true);
    expect(isTerminalLeadStatus("lost")).toBe(true);
    expect(isTerminalLeadStatus("archived")).toBe(true);
    expect(isTerminalLeadStatus("duplicate")).toBe(true);
    expect(isTerminalLeadStatus("new")).toBe(false);
  });

  it("flags overdue deadlines only for non-terminal statuses", () => {
    const past = "2020-01-01T00:00:00.000Z";
    const future = "2099-01-01T00:00:00.000Z";
    const now = new Date("2025-01-01T00:00:00.000Z");

    expect(isDeadlineOverdue("new", past, now)).toBe(true);
    expect(isDeadlineOverdue("new", future, now)).toBe(false);
    expect(isDeadlineOverdue("won", past, now)).toBe(false);
  });
});
