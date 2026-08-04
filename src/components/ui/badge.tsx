import { cn } from "@/lib/utils";

export type BadgeTone = "slate" | "amber" | "indigo" | "emerald" | "rose";

const TONE_STYLES: Record<BadgeTone, string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-600",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
};

const DOT_STYLES: Record<BadgeTone, string> = {
  slate: "bg-slate-400",
  amber: "bg-amber-500",
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
};

export interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children: React.ReactNode;
}

export function Badge({ tone = "slate", dot = false, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_STYLES[tone],
      )}
    >
      {dot ? (
        <span className={cn("size-1.5 rounded-full", DOT_STYLES[tone])} aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}
