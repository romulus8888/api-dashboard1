"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Defaults depend on the variant. */
  duration?: number;
}

interface ToastRecord {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

export interface ToastA11yLabels {
  regionLabel: string;
  dismissLabel: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const MAX_VISIBLE_TOASTS = 3;

const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  success: 4000,
  error: 7000,
  info: 5000,
};

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof Info; accent: string; border: string }> = {
  success: {
    icon: CheckCircle2,
    accent: "bg-emerald-50 text-emerald-600",
    border: "border-emerald-200",
  },
  error: { icon: AlertCircle, accent: "bg-rose-50 text-rose-600", border: "border-rose-200" },
  info: { icon: Info, accent: "bg-slate-100 text-slate-600", border: "border-slate-200" },
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export function ToastProvider({
  children,
  labels,
}: {
  children: React.ReactNode;
  labels: ToastA11yLabels;
}) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const hydrated = useHydrated();
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "info", duration }: ToastOptions) => {
      const id = `toast-${(toastCounter += 1)}`;

      setToasts((current) => [
        ...current.slice(-(MAX_VISIBLE_TOASTS - 1)),
        { id, title, description, variant },
      ]);

      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), duration ?? DEFAULT_DURATIONS[variant]),
      );
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {hydrated
        ? createPortal(
            <div
              aria-label={labels.regionLabel}
              className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96"
            >
              {toasts.map((item) => (
                <ToastCard
                  key={item.id}
                  toast={item}
                  dismissLabel={labels.dismissLabel}
                  onDismiss={dismiss}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a <ToastProvider>.");
  }
  return context;
}

function ToastCard({
  toast,
  dismissLabel,
  onDismiss,
}: {
  toast: ToastRecord;
  dismissLabel: string;
  onDismiss: (id: string) => void;
}) {
  const { icon: Icon, accent, border } = VARIANT_STYLES[toast.variant];

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto flex w-full animate-slide-in-up items-start gap-3 rounded-2xl border bg-white p-4 shadow-2xl shadow-slate-900/10",
        border,
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", accent)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-sm break-words text-slate-500">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={dismissLabel}
        className="-mr-1 shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
