import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDashboardAccess } from "@/lib/auth/dashboard-access";
import { AuthError } from "@/lib/auth/errors";

const { requireActiveOperatorMock } = vi.hoisted(() => ({
  requireActiveOperatorMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-active-operator", () => ({
  requireActiveOperator: requireActiveOperatorMock,
}));

describe("getDashboardAccess", () => {
  beforeEach(() => {
    requireActiveOperatorMock.mockReset();
  });

  it("returns authorized for active operators", async () => {
    requireActiveOperatorMock.mockResolvedValue({
      userId: "user-1",
      operator: { id: "user-1", display_name: "Operator", is_active: true },
    });

    await expect(getDashboardAccess()).resolves.toEqual({ kind: "authorized" });
  });

  it("maps auth failures to unauthenticated and forbidden states", async () => {
    requireActiveOperatorMock.mockRejectedValueOnce(new AuthError(401, "Unauthorized"));
    requireActiveOperatorMock.mockRejectedValueOnce(new AuthError(403, "Forbidden"));

    await expect(getDashboardAccess()).resolves.toEqual({ kind: "unauthenticated" });
    await expect(getDashboardAccess()).resolves.toEqual({ kind: "forbidden" });
  });
});
