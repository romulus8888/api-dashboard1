import { describe, expect, it } from "vitest";

import { AdminLeadsApiError } from "@/lib/admin/admin-leads-client";
import { buildAdminLoginPath, isAdminSessionExpired } from "@/lib/auth/admin-session-expiry";

describe("admin session expiry helpers", () => {
  it("detects session_expired admin API errors", () => {
    expect(isAdminSessionExpired(new AdminLeadsApiError("session_expired", 401))).toBe(true);
    expect(isAdminSessionExpired(new AdminLeadsApiError("forbidden", 403))).toBe(false);
    expect(isAdminSessionExpired(new Error("session_expired"))).toBe(false);
  });

  it("builds a validated login path for the dashboard", () => {
    expect(buildAdminLoginPath("en")).toBe("/en/login?returnTo=%2Fen%2Fdashboard");
    expect(buildAdminLoginPath("ru", "/ru/dashboard")).toBe("/ru/login?returnTo=%2Fru%2Fdashboard");
  });

  it("rejects unsafe return paths when building the login redirect", () => {
    expect(buildAdminLoginPath("en", "https://evil.example")).toBe(
      "/en/login?returnTo=%2Fen%2Fdashboard",
    );
    expect(buildAdminLoginPath("en", "//evil.example")).toBe("/en/login?returnTo=%2Fen%2Fdashboard");
    expect(buildAdminLoginPath("en", "/ru/dashboard")).toBe("/en/login?returnTo=%2Fen%2Fdashboard");
  });
});
