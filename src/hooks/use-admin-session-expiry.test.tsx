import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/i18n/locale-provider";
import { en } from "@/i18n/dictionaries/en";
import { useAdminSessionExpiry } from "@/hooks/use-admin-session-expiry";

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

function renderSessionExpiryHook(actions = {
  clearLoadedLeads: vi.fn(),
  clearSelectedLead: vi.fn(),
}) {
  return renderHook(() => useAdminSessionExpiry(actions), {
    wrapper: ({ children }) => (
      <LocaleProvider locale="en" dictionary={en}>{children}</LocaleProvider>
    ),
  });
}

describe("useAdminSessionExpiry", () => {
  beforeEach(() => {
    mockReplace.mockReset();
  });

  it("clears leads, selection, and redirects once", () => {
    const clearLoadedLeads = vi.fn();
    const clearSelectedLead = vi.fn();
    const { result } = renderSessionExpiryHook({
      clearLoadedLeads,
      clearSelectedLead,
    });

    act(() => {
      result.current();
      result.current();
    });

    expect(clearLoadedLeads).toHaveBeenCalledTimes(1);
    expect(clearSelectedLead).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/en/login?returnTo=%2Fen%2Fdashboard");
  });
});
