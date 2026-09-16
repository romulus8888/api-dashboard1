export interface PostgrestLeadRow {
  id: string;
  status?: string;
  automation_state?: string;
  automation_attempt?: number;
  created_at?: string;
}

function isLeadRow(value: unknown): value is PostgrestLeadRow {
  return Boolean(value) && typeof value === "object" && typeof (value as { id?: unknown }).id === "string";
}

function collectLeadPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.leads)) {
    return record.leads;
  }

  if (isLeadRow(payload)) {
    return [payload];
  }

  const keys = Object.keys(record);
  if (keys.length > 0 && keys.every((key) => /^\d+$/.test(key))) {
    return keys
      .sort((left, right) => Number(left) - Number(right))
      .map((key) => record[key]);
  }

  return [];
}

export function expandPostgrestLeadArray(payload: unknown): PostgrestLeadRow[] {
  return collectLeadPayload(payload).filter(isLeadRow);
}

export function expandPostgrestN8nItems(itemJsons: unknown[]): PostgrestLeadRow[] {
  const first = itemJsons[0];
  const wrappedInFirstItem =
    Array.isArray(first)
    || Boolean(first && typeof first === "object" && Array.isArray((first as { leads?: unknown }).leads));

  if (wrappedInFirstItem) {
    return expandPostgrestLeadArray(first);
  }

  return itemJsons.flatMap((payload) => expandPostgrestLeadArray(payload));
}

export function isLeadPollingEligible(lead: Pick<PostgrestLeadRow, "status" | "automation_state">): boolean {
  return (
    lead.automation_state === "idle"
    && (lead.status === "new" || lead.status === "needs_review")
  );
}

export const POSTGREST_LEAD_ARRAY_CODE = `function isLead(value) {
  return Boolean(value) && typeof value === "object" && typeof value.id === "string";
}

function collect(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  if (Array.isArray(payload.leads)) {
    return payload.leads;
  }

  if (isLead(payload)) {
    return [payload];
  }

  const keys = Object.keys(payload);
  if (keys.length > 0 && keys.every((key) => /^\\d+$/.test(key))) {
    return keys
      .sort((left, right) => Number(left) - Number(right))
      .map((key) => payload[key]);
  }

  return [];
}

const items = $input.all().map((item) => item.json);
const first = items[0];
const wrappedInFirstItem = Array.isArray(first) || Array.isArray(first?.leads);
const leads = (wrappedInFirstItem
  ? collect(first)
  : items.flatMap((payload) => collect(payload))
).filter(isLead);

if (leads.length === 0) {
  return [];
}

return leads.map((lead) => ({ json: lead }));`;
