import { describe, expect, it } from "vitest";

import { isFunnelMonotonic, safeConversion } from "@/lib/admin/metrics-assertions";

describe("metrics assertions", () => {
  it("enforces funnel milestone monotonicity", () => {
    expect(
      isFunnelMonotonic({
        received: 10,
        started: 8,
        contacted: 6,
        qualified: 4,
        won: 2,
      }),
    ).toBe(true);

    expect(
      isFunnelMonotonic({
        received: 10,
        started: 11,
        contacted: 6,
        qualified: 4,
        won: 2,
      }),
    ).toBe(false);
  });

  it("handles zero denominators safely", () => {
    expect(safeConversion(3, 0)).toBeNull();
    expect(safeConversion(3, 10)).toBe(0.3);
  });
});
