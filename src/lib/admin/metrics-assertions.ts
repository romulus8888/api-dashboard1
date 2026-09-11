import type { LeadMetricsFunnel } from "@/types/metrics";

export function isFunnelMonotonic(funnel: LeadMetricsFunnel): boolean {
  return (
    funnel.received >= funnel.started &&
    funnel.started >= funnel.contacted &&
    funnel.contacted >= funnel.qualified &&
    funnel.qualified >= funnel.won
  );
}

export function safeConversion(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}
