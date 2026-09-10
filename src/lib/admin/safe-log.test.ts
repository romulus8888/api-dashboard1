import { describe, expect, it, vi } from "vitest";

import { logAdminError } from "@/lib/admin/safe-log";
import { logger } from "@/lib/logger";

describe("logAdminError", () => {
  it("does not log service_role details", () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    logAdminError("admin-test", "failure", new Error("service_role key rejected"));

    expect(errorSpy).toHaveBeenCalledWith(
      "admin-test",
      "failure",
      expect.objectContaining({
        name: "Error",
      }),
    );

    const payload = errorSpy.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload.message).toBeUndefined();
  });
});
