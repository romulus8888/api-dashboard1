"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { useToast } from "@/components/ui/toast";
import { useLocaleContext } from "@/i18n/locale-provider";
import { AdminLeadsApiError, resetAdminDemoData } from "@/lib/admin/admin-leads-client";
import { isAdminSessionExpired } from "@/lib/auth/admin-session-expiry";

export interface DemoResetActionProps {
  onSessionExpired: () => void;
  onResetComplete: () => Promise<void>;
  disabled?: boolean;
}

export function DemoResetAction({
  onSessionExpired,
  onResetComplete,
  disabled = false,
}: DemoResetActionProps) {
  const { dictionary } = useLocaleContext();
  const labels = dictionary.leads.demoReset;
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const statusId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      cancelButtonRef.current?.focus();
      return;
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = useCallback(() => {
    if (pending) return;
    setOpen(false);
  }, [pending]);

  const handleConfirm = useCallback(async () => {
    if (pending) return;

    setPending(true);
    try {
      const result = await resetAdminDemoData();
      await onResetComplete();
      setOpen(false);
      toast({
        variant: "success",
        title: labels.successTitle,
        description: labels.successDescription
          .replace("{deleted}", String(result.deleted_count))
          .replace("{inserted}", String(result.inserted_count)),
      });
    } catch (error) {
      if (isAdminSessionExpired(error)) {
        onSessionExpired();
        return;
      }

      if (error instanceof AdminLeadsApiError && error.code === "conflict") {
        toast({
          variant: "error",
          title: labels.errorTitle,
          description: labels.errorConflict,
        });
        return;
      }

      toast({
        variant: "error",
        title: labels.errorTitle,
        description: labels.errorFailed,
      });
    } finally {
      setPending(false);
    }
  }, [labels, onResetComplete, onSessionExpired, pending, toast]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || pending}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900 shadow-sm transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {labels.button}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={pending}
        onCancel={(event) => {
          if (pending) {
            event.preventDefault();
            return;
          }
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        className="w-[min(100%,28rem)] rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {labels.title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-600">
          {labels.description}
        </p>
        <p
          id={statusId}
          role="status"
          aria-live="polite"
          className="mt-3 min-h-5 text-sm text-slate-500"
        >
          {pending ? labels.pending : ""}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={handleClose}
            disabled={pending}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={pending}
            aria-describedby={pending ? statusId : undefined}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {labels.pending}
              </>
            ) : (
              labels.confirm
            )}
          </button>
        </div>
      </dialog>
    </>
  );
}
