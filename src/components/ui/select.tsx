"use client";

import { ChevronDown } from "lucide-react";

import type { BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SelectTone = BadgeTone | "neutral";

export type SelectSize = "sm" | "md";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  id: string;
  /** Visible unless `hideLabel` is set, in which case it stays available to screen readers. */
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
  disabled?: boolean;
  tone?: SelectTone;
  size?: SelectSize;
  /** Applied to the wrapper so callers control layout without fighting the control's own styles. */
  className?: string;
}

const TONE_STYLES: Record<SelectTone, string> = {
  neutral: "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
  slate: "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300",
  amber: "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-800 hover:border-indigo-300",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300",
  rose: "border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300",
};

const SIZE_STYLES: Record<SelectSize, string> = {
  sm: "rounded-full py-1 pl-3 pr-8 text-xs",
  md: "rounded-xl py-2.5 pl-3 pr-9 text-sm",
};

const CHEVRON_STYLES: Record<SelectSize, string> = {
  sm: "right-2.5 size-3",
  md: "right-3 size-4",
};

export function Select<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  disabled = false,
  tone = "neutral",
  size = "md",
  className,
}: SelectProps<T>) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={
          hideLabel ? "sr-only" : "mb-1.5 block text-sm font-medium text-slate-700"
        }
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as T)}
          className={cn(
            "w-full cursor-pointer appearance-none border font-medium shadow-sm outline-none transition",
            "focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10",
            "disabled:cursor-not-allowed disabled:opacity-60",
            TONE_STYLES[tone],
            SIZE_STYLES[size],
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="text-slate-900">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-60",
            CHEVRON_STYLES[size],
          )}
        />
      </div>
    </div>
  );
}
