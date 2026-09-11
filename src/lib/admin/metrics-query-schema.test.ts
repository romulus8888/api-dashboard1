import { describe, expect, it } from "vitest";

import {
  MAX_METRICS_RANGE_DAYS,
  metricsQuerySchema,
  resolveMetricsRange,
} from "@/lib/admin/metrics-query-schema";

describe("metricsQuerySchema", () => {
  it("defaults to the previous 30 days", () => {
    const now = new Date("2026-09-11T12:00:00.000Z");
    const range = resolveMetricsRange({}, now);

    expect(range.to).toBe("2026-09-11T12:00:00.000Z");
    expect(range.from).toBe("2026-08-12T12:00:00.000Z");
  });

  it("rejects partial ranges, inverted ranges, and ranges over 366 days", () => {
    expect(() =>
      metricsQuerySchema.parse({ from: "2026-09-01T00:00:00.000Z" }),
    ).toThrow();

    expect(() =>
      metricsQuerySchema.parse({
        from: "2026-09-10T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
      }),
    ).toThrow();

    const from = "2024-01-01T00:00:00.000Z";
    const to = new Date(Date.parse(from) + (MAX_METRICS_RANGE_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();

    expect(() => metricsQuerySchema.parse({ from, to })).toThrow();
  });

  it("accepts only canonical UTC timestamps ending in Z", () => {
    const parsed = metricsQuerySchema.parse({
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
    });

    expect(parsed.from).toBe("2026-08-01T00:00:00.000Z");
  });

  it("rejects non-zero offsets, date-only values, and malformed timestamps", () => {
    expect(() =>
      metricsQuerySchema.parse({
        from: "2026-08-01T00:00:00.000+00:00",
        to: "2026-09-01T00:00:00.000Z",
      }),
    ).toThrow();

    expect(() =>
      metricsQuerySchema.parse({
        from: "2026-09-01T05:00:00+05:00",
        to: "2026-09-01T00:00:00.000Z",
      }),
    ).toThrow();

    expect(() =>
      metricsQuerySchema.parse({
        from: "2026-08-01",
        to: "2026-09-01T00:00:00.000Z",
      }),
    ).toThrow();

    expect(() =>
      metricsQuerySchema.parse({
        from: "2026-08-01T00:00:00Z",
        to: "2026-09-01T00:00:00.000Z",
      }),
    ).toThrow();

    expect(() =>
      metricsQuerySchema.parse({
        from: "not-a-date",
        to: "2026-09-01T00:00:00.000Z",
      }),
    ).toThrow();
  });
});
