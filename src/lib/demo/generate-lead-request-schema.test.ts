import { describe, expect, it } from "vitest";

import {
  generateLeadRequestSchema,
  MAX_GENERATE_LEAD_BODY_BYTES,
} from "@/lib/demo/generate-lead-request-schema";

describe("generateLeadRequestSchema", () => {
  it("accepts locale and turnstile token only", () => {
    const result = generateLeadRequestSchema.parse({
      locale: "en",
      turnstileToken: "token-123",
    });

    expect(result).toEqual({
      locale: "en",
      turnstileToken: "token-123",
    });
  });

  it("rejects unknown fields", () => {
    expect(() =>
      generateLeadRequestSchema.parse({
        locale: "en",
        turnstileToken: "token-123",
        title: "visitor supplied",
      }),
    ).toThrow();
  });

  it("rejects invalid locale values", () => {
    expect(() =>
      generateLeadRequestSchema.parse({
        locale: "de",
        turnstileToken: "token-123",
      }),
    ).toThrow();
  });

  it("documents the 1 KB body limit constant", () => {
    expect(MAX_GENERATE_LEAD_BODY_BYTES).toBe(1024);
  });
});
