import type { LeadSource } from "@/types/lead";

export interface LeadMetricsRange {
  from: string;
  to: string;
  as_of: string;
}

export interface LeadMetricsFunnel {
  received: number;
  started: number;
  contacted: number;
  qualified: number;
  won: number;
}

export interface LeadMetricsConversion {
  overall: number | null;
  received_to_started: number | null;
  started_to_contacted: number | null;
  contacted_to_qualified: number | null;
  qualified_to_won: number | null;
}

export interface LeadMetricsSourceBreakdown {
  source: LeadSource;
  received: number;
  won: number;
  conversion: number | null;
}

export interface LeadMetricsTimingBucket {
  average_seconds: number | null;
  median_seconds: number | null;
  sample_size: number;
}

export interface LeadMetricsTiming {
  first_action: LeadMetricsTimingBucket;
  first_terminal: LeadMetricsTimingBucket;
}

export interface LeadMetricsOverdue {
  first_response: number;
  next_action: number;
  total: number;
}

export interface LeadMetrics {
  range: LeadMetricsRange;
  funnel: LeadMetricsFunnel;
  conversion: LeadMetricsConversion;
  sources: LeadMetricsSourceBreakdown[];
  timing: LeadMetricsTiming;
  overdue: LeadMetricsOverdue;
}
