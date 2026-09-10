import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleLogin, handleLogout } from "@/lib/auth/login-handler";

const { createAuthServerClientMock } = vi.hoisted(() => ({
  createAuthServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  createAuthServerClient: createAuthServerClientMock,
  SupabaseAuthConfigError: class SupabaseAuthConfigError extends Error {},
}));

function buildLoginRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth login handlers", () => {
  beforeEach(() => {
    createAuthServerClientMock.mockReset();
  });

  it("returns a generic invalid-credentials error code on failed sign-in", async () => {
    createAuthServerClientMock.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          error: { name: "AuthApiError", message: "Invalid login credentials" },
        }),
      },
    });

    const response = await handleLogin(
      buildLoginRequest({ email: "operator@example.demo", password: "wrong-password" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_credentials" });
  });

  it("signs in successfully", async () => {
    createAuthServerClientMock.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      },
    });

    const response = await handleLogin(
      buildLoginRequest({ email: "operator@example.demo", password: "correct-password" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("signs out successfully", async () => {
    createAuthServerClientMock.mockResolvedValue({
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    });

    const response = await handleLogout();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
