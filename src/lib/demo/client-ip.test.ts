import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getTrustedClientIp,
  parseValidatedClientIp,
  UNKNOWN_CLIENT_IDENTITY,
} from "@/lib/demo/client-ip";

function buildRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/demo/generate-lead", {
    method: "POST",
    headers,
  });
}

describe("parseValidatedClientIp", () => {
  it("accepts IPv4 and IPv6 addresses", () => {
    expect(parseValidatedClientIp("203.0.113.10")).toBe("203.0.113.10");
    expect(parseValidatedClientIp("2001:db8::1")).toBe("2001:db8::1");
    expect(parseValidatedClientIp("203.0.113.10:12345")).toBe("203.0.113.10");
  });

  it("rejects invalid values", () => {
    expect(parseValidatedClientIp("not-an-ip")).toBeNull();
    expect(parseValidatedClientIp("")).toBeNull();
  });
});

describe("getTrustedClientIp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses x-vercel-forwarded-for when valid", () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = buildRequest({
      "x-vercel-forwarded-for": "203.0.113.10",
      "x-forwarded-for": "198.51.100.99",
      "x-real-ip": "198.51.100.88",
    });

    expect(getTrustedClientIp(request)).toBe("203.0.113.10");
  });

  it("ignores spoofable forwarding headers in production when Vercel header is absent", () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = buildRequest({
      "x-forwarded-for": "198.51.100.99",
      "x-real-ip": "198.51.100.88",
    });

    expect(getTrustedClientIp(request)).toBe(UNKNOWN_CLIENT_IDENTITY);
  });

  it("ignores spoofable forwarding headers in production when Vercel header is invalid", () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = buildRequest({
      "x-vercel-forwarded-for": "definitely-not-an-ip",
      "x-forwarded-for": "198.51.100.99",
    });

    expect(getTrustedClientIp(request)).toBe(UNKNOWN_CLIENT_IDENTITY);
  });

  it("does not trust x-real-ip or x-forwarded-for outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

    const request = buildRequest({
      "x-forwarded-for": "198.51.100.99",
      "x-real-ip": "198.51.100.88",
    });

    expect(getTrustedClientIp(request)).toBe(UNKNOWN_CLIENT_IDENTITY);
  });
});
