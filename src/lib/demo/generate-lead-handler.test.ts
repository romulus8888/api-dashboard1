import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleGenerateDemoLead } from "@/lib/demo/generate-lead-handler";

const {
  createServerSupabaseClientMock,
  verifyTurnstileTokenMock,
  isProductionEnvironmentMock,
  getTurnstileSecretKeyMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  verifyTurnstileTokenMock: vi.fn(),
  isProductionEnvironmentMock: vi.fn(),
  getTurnstileSecretKeyMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
  SupabaseServerConfigError: class SupabaseServerConfigError extends Error {},
}));

vi.mock("@/lib/demo/turnstile", () => ({
  verifyTurnstileToken: verifyTurnstileTokenMock,
  isProductionEnvironment: isProductionEnvironmentMock,
  getTurnstileSecretKey: getTurnstileSecretKeyMock,
  TurnstileConfigError: class TurnstileConfigError extends Error {},
  TurnstileVerificationError: class TurnstileVerificationError extends Error {
    constructor(message = "Turnstile verification failed.") {
      super(message);
      this.name = "TurnstileVerificationError";
    }
  },
}));

function buildRequest(body: unknown, headers?: HeadersInit): Request {
  return new Request("http://localhost/api/demo/generate-lead", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock(options?: {
  rateLimitAllowed?: boolean;
  retryAfterSeconds?: number;
  insertLead?: Record<string, unknown>;
}) {
  const rateLimitAllowed = options?.rateLimitAllowed ?? true;
  const retryAfterSeconds = options?.retryAfterSeconds ?? 0;
  const insertLead =
    options?.insertLead ??
    {
      id: "11111111-1111-1111-1111-111111111111",
      status: "new",
      priority: "medium",
      source: "demo_seed",
      locale: "en",
      contact_name: "Alex Rivera",
      contact_email: "alex.rivera@example.demo",
      contact_phone: "+1-555-0101",
      title: "Migrate billing API to v2",
      description: "Fictional scope",
      budget_amount: 12000,
      budget_currency: "USD",
      is_synthetic: true,
      demo_reset_group_id: "22222222-2222-2222-2222-222222222222",
      created_at: "2026-09-10T12:00:00.000Z",
    };

  return {
    rpc: vi.fn().mockResolvedValue({
      data: {
        allowed: rateLimitAllowed,
        retry_after_seconds: retryAfterSeconds,
      },
      error: null,
    }),
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: insertLead,
            error: null,
          }),
        })),
      })),
    })),
  };
}

describe("handleGenerateDemoLead", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.DEMO_RATE_LIMIT_SECRET = "rate-limit-secret";
    process.env.DEMO_RATE_LIMIT_MAX_REQUESTS = "10";
    process.env.DEMO_RATE_LIMIT_WINDOW_SECONDS = "3600";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret";

    isProductionEnvironmentMock.mockReturnValue(false);
    getTurnstileSecretKeyMock.mockReturnValue("turnstile-secret");
    verifyTurnstileTokenMock.mockResolvedValue(undefined);
    createServerSupabaseClientMock.mockReturnValue(createSupabaseMock());
  });

  it("returns 201 with a safe synthetic summary on success", async () => {
    const response = await handleGenerateDemoLead(
      buildRequest({
        locale: "en",
        turnstileToken: "valid-token",
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.lead).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      locale: "en",
      status: "new",
      priority: "medium",
      isSynthetic: true,
    });
    expect(payload.lead).not.toHaveProperty("contact_email");
    expect(verifyTurnstileTokenMock).toHaveBeenCalledWith("valid-token", "203.0.113.10");
  });

  it("rejects unknown fields and oversize bodies", async () => {
    const invalidFieldResponse = await handleGenerateDemoLead(
      buildRequest({
        locale: "en",
        turnstileToken: "valid-token",
        client_email: "visitor@example.com",
      }),
    );

    expect(invalidFieldResponse.status).toBe(400);

    const oversizedResponse = await handleGenerateDemoLead(
      new Request("http://localhost/api/demo/generate-lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "x".repeat(1025),
      }),
    );

    expect(oversizedResponse.status).toBe(413);
  });

  it("rejects invalid turnstile tokens", async () => {
    const { TurnstileVerificationError } = await import("@/lib/demo/turnstile");
    verifyTurnstileTokenMock.mockRejectedValueOnce(new TurnstileVerificationError());

    const response = await handleGenerateDemoLead(
      buildRequest({
        locale: "ru",
        turnstileToken: "bad-token",
      }),
    );

    expect(response.status).toBe(403);
  });

  it("returns 429 with Retry-After when rate limited", async () => {
    createServerSupabaseClientMock.mockReturnValue(
      createSupabaseMock({
        rateLimitAllowed: false,
        retryAfterSeconds: 120,
      }),
    );

    const response = await handleGenerateDemoLead(
      buildRequest({
        locale: "en",
        turnstileToken: "valid-token",
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
  });

  it("returns 503 when required environment configuration is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await handleGenerateDemoLead(
      buildRequest({
        locale: "en",
        turnstileToken: "valid-token",
      }),
    );

    expect(response.status).toBe(503);
  });

  it("fails closed in production when turnstile secret is missing", async () => {
    isProductionEnvironmentMock.mockReturnValue(true);
    getTurnstileSecretKeyMock.mockReturnValue(null);

    const response = await handleGenerateDemoLead(
      buildRequest({
        locale: "en",
        turnstileToken: "valid-token",
      }),
    );

    expect(response.status).toBe(503);
    expect(verifyTurnstileTokenMock).not.toHaveBeenCalled();
  });
});
