export const LEAD_STATUSES = [
  "new",
  "in_progress",
  "contacted",
  "qualified",
  "won",
  "lost",
  "needs_review",
  "archived",
  "duplicate",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_PRIORITIES = ["low", "medium", "high"] as const;

export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const LEAD_SOURCES = [
  "website",
  "demo_seed",
  "manual",
  "telegram",
  "email",
  "max",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_LOCALES = ["en", "ru"] as const;

export type LeadLocale = (typeof LEAD_LOCALES)[number];

export interface Lead {
  id: string;
  status: LeadStatus;
  priority: LeadPriority;
  source: LeadSource;
  locale: LeadLocale | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  title: string;
  description: string;
  budget_amount: number | null;
  budget_currency: string;
  is_synthetic: boolean;
  demo_reset_group_id: string | null;
  created_at: string;
}

type LeadRow = { [K in keyof Lead]: Lead[K] };

export type LeadInsert = {
  source: LeadSource;
  locale?: LeadLocale | null;
  contact_name: string;
  contact_email: string;
  contact_phone?: string | null;
  title: string;
  description: string;
  budget_amount?: number | null;
  budget_currency?: string;
  priority?: LeadPriority;
  is_synthetic?: boolean;
  demo_reset_group_id?: string | null;
  status?: LeadStatus;
};

interface DemoRateLimitBucketRow {
  bucket_key: string;
  window_start: string;
  request_count: number;
  expires_at: string;
}

type DemoRateLimitBucket = { [K in keyof DemoRateLimitBucketRow]: DemoRateLimitBucketRow[K] };

export interface DemoRateLimitResult {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
}

export interface DemoLeadSummary {
  id: string;
  locale: LeadLocale;
  status: LeadStatus;
  priority: LeadPriority;
  title: string;
  personaLabel: string;
  isSynthetic: true;
  createdAt: string;
}

export interface Database {
  public: {
    Tables: {
      leads: {
        Row: LeadRow;
        Insert: LeadInsert;
        Update: Partial<LeadInsert>;
        Relationships: [];
      };
      demo_rate_limit_buckets: {
        Row: DemoRateLimitBucket;
        Insert: DemoRateLimitBucket;
        Update: Partial<DemoRateLimitBucket>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      check_demo_rate_limit: {
        Args: {
          p_bucket_key: string;
          p_max_requests: number;
          p_window_seconds: number;
        };
        Returns: DemoRateLimitResult;
      };
    };
    Enums: {
      lead_status: LeadStatus;
      lead_priority: LeadPriority;
      lead_source: LeadSource;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
