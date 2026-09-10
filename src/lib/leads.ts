import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, DemoLeadSummary, LeadInsert, SyntheticLead } from "@/types/lead";

export class LeadsApiError extends Error {
  readonly code: string | undefined;
  readonly details: string | undefined;

  constructor(message: string, code?: string, details?: string) {
    super(message);
    this.name = "LeadsApiError";
    this.code = code;
    this.details = details;
  }
}

export function toDemoLeadSummary(
  lead: SyntheticLead,
  personaLabel: string,
): DemoLeadSummary {
  return {
    id: lead.id,
    locale: lead.locale ?? "en",
    status: lead.status,
    priority: lead.priority,
    title: lead.title,
    personaLabel,
    isSynthetic: true,
    createdAt: lead.created_at,
  };
}

export async function insertSyntheticLead(
  supabase: SupabaseClient<Database>,
  input: LeadInsert,
): Promise<SyntheticLead> {
  const { data, error } = await supabase
    .from("leads")
    .insert(input)
    .select(
      "id, status, priority, source, locale, contact_name, contact_email, contact_phone, title, description, budget_amount, budget_currency, is_synthetic, demo_reset_group_id, created_at",
    )
    .single();

  if (error) {
    throw new LeadsApiError(error.message, error.code, error.details);
  }

  return data;
}
