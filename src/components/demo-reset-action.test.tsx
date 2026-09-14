import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DemoResetAction } from "@/components/demo-reset-action";
import { ToastProvider } from "@/components/ui/toast";
import { LocaleProvider } from "@/i18n/locale-provider";
import { en } from "@/i18n/dictionaries/en";
import { AdminLeadsApiError, resetAdminDemoData } from "@/lib/admin/admin-leads-client";

vi.mock("@/lib/admin/admin-leads-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/admin-leads-client")>();
  return {
    ...actual,
    resetAdminDemoData: vi.fn(),
  };
});

function renderAction(
  props: Partial<{
    onSessionExpired: () => void;
    onResetComplete: () => Promise<void>;
    disabled: boolean;
  }> = {},
) {
  const onSessionExpired = vi.fn();
  const onResetComplete = vi.fn().mockResolvedValue(undefined);

  render(
    <LocaleProvider locale="en" dictionary={en}>
      <ToastProvider labels={{ regionLabel: "Notifications", dismissLabel: "Dismiss" }}>
        <DemoResetAction
          onSessionExpired={onSessionExpired}
          onResetComplete={onResetComplete}
          disabled={props.disabled ?? false}
        />
      </ToastProvider>
    </LocaleProvider>,
  );

  return { onSessionExpired, onResetComplete };
}

describe("DemoResetAction", () => {
  beforeEach(() => {
    vi.mocked(resetAdminDemoData).mockReset();
    HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
      this.open = false;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("opens a confirmation dialog with accessible labels", () => {
    renderAction();

    fireEvent.click(screen.getByRole("button", { name: en.leads.demoReset.button }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(en.leads.demoReset.title)).toBeTruthy();
    expect(screen.getByText(en.leads.demoReset.description)).toBeTruthy();
  });

  it("refreshes dashboard data and shows success after confirmation", async () => {
    vi.mocked(resetAdminDemoData).mockResolvedValue({
      demo_reset_group_id: "33333333-3333-4333-8333-333333333333",
      deleted_count: 10,
      inserted_count: 10,
    });

    const { onResetComplete } = renderAction();

    fireEvent.click(screen.getByRole("button", { name: en.leads.demoReset.button }));
    fireEvent.click(screen.getByRole("button", { name: en.leads.demoReset.confirm }));

    await waitFor(() => {
      expect(resetAdminDemoData).toHaveBeenCalledTimes(1);
      expect(onResetComplete).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(en.leads.demoReset.successTitle)).toBeTruthy();
  });

  it("shows a conflict message when another reset is running", async () => {
    vi.mocked(resetAdminDemoData).mockRejectedValue(new AdminLeadsApiError("conflict", 409));

    renderAction();

    fireEvent.click(screen.getByRole("button", { name: en.leads.demoReset.button }));
    fireEvent.click(screen.getByRole("button", { name: en.leads.demoReset.confirm }));

    await waitFor(() => {
      expect(screen.getByText(en.leads.demoReset.errorConflict)).toBeTruthy();
    });
  });
});
