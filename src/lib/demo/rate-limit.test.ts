import { describe, expect, it } from "vitest";

import { hashClientIdentifier } from "@/lib/demo/rate-limit";

describe("hashClientIdentifier", () => {
  it("returns a stable keyed hash without storing raw IP text in the bucket key helper", () => {
    const first = hashClientIdentifier("203.0.113.10", "secret-a");
    const second = hashClientIdentifier("203.0.113.10", "secret-a");
    const differentSecret = hashClientIdentifier("203.0.113.10", "secret-b");

    expect(first).toBe(second);
    expect(first).not.toBe(differentSecret);
    expect(first).not.toContain("203.0.113.10");
  });
});
