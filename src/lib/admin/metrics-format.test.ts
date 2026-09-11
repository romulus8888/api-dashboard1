import { describe, expect, it } from "vitest";

import {
  formatDurationSeconds,
  formatPercent,
} from "@/lib/admin/metrics-format";

describe("metrics format helpers", () => {
  it("formats percentages without NaN or Infinity", () => {
    expect(formatPercent(0.125, "en")).toMatch(/12\.5%/);
    expect(formatPercent(null, "en")).toBe("—");
    expect(formatPercent(Number.NaN, "en")).toBe("—");
  });

  it("formats durations for EN and RU", () => {
    expect(formatDurationSeconds(3600, "en")).toMatch(/1/);
    expect(formatDurationSeconds(null, "ru")).toBe("—");
  });
});
