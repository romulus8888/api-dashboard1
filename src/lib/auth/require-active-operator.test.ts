import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "@/lib/auth/errors";
import { requireActiveOperator } from "@/lib/auth/require-active-operator";

const { createAuthServerClientMock, createServiceSupabaseClientMock } = vi.hoisted(() => ({
  createAuthServerClientMock: vi.fn(),
  createServiceSupabaseClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  createAuthServerClient: createAuthServerClientMock,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: createServiceSupabaseClientMock,
}));

describe("requireActiveOperator", () => {
  beforeEach(() => {
    createAuthServerClientMock.mockReset();
    createServiceSupabaseClientMock.mockReset();
  });

  it("returns 401 when no authenticated user is present", async () => {
    createAuthServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    await expect(requireActiveOperator()).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized",
    });
  });

  it("returns 403 when operator profile is missing or inactive", async () => {
    createAuthServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    });

    createServiceSupabaseClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        })),
      })),
    });

    await expect(requireActiveOperator()).rejects.toBeInstanceOf(AuthError);
    await expect(requireActiveOperator()).rejects.toMatchObject({ status: 403 });
  });

  it("returns the verified active operator", async () => {
    createAuthServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    });

    createServiceSupabaseClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "user-1",
                  display_name: "Operator One",
                  is_active: true,
                },
                error: null,
              }),
            })),
          })),
        })),
      })),
    });

    await expect(requireActiveOperator()).resolves.toEqual({
      userId: "user-1",
      operator: {
        id: "user-1",
        display_name: "Operator One",
        is_active: true,
      },
    });
  });
});
