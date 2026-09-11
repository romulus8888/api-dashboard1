export interface PostgrestLeadRow {
  id: string;
  status?: string;
  automation_state?: string;
  automation_attempt?: number;
  created_at?: string;
}

export function expandPostgrestLeadArray(payload: unknown): PostgrestLeadRow[] {
  const leads = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { leads?: unknown }).leads)
      ? (payload as { leads: PostgrestLeadRow[] }).leads
      : [];

  return leads.filter(
    (lead): lead is PostgrestLeadRow =>
      Boolean(lead) && typeof lead === "object" && typeof (lead as PostgrestLeadRow).id === "string",
  );
}

export function isLeadPollingEligible(lead: Pick<PostgrestLeadRow, "status" | "automation_state">): boolean {
  return (
    lead.automation_state === "idle"
    && (lead.status === "new" || lead.status === "needs_review")
  );
}

export const POSTGREST_LEAD_ARRAY_CODE = `const input = $input.first()?.json;
const leads = Array.isArray(input)
  ? input
  : Array.isArray(input?.leads)
    ? input.leads
    : [];

if (leads.length === 0) {
  return [];
}

return leads.map((lead) => ({ json: lead }));`;
