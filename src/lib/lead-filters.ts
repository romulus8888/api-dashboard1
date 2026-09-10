import type { AdminLeadListItem } from "@/lib/admin/admin-leads-client";
import type { LeadPriority, LeadStatus } from "@/types/lead";

export type StatusFilter = LeadStatus | "all";

export type PriorityFilter = LeadPriority | "all";

export interface LeadFilters {
  search: string;
  status: StatusFilter;
  priority: PriorityFilter;
}

export const DEFAULT_LEAD_FILTERS: LeadFilters = {
  search: "",
  status: "all",
  priority: "all",
};

function toSearchableText(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function hasActiveFilters(filters: LeadFilters | null | undefined): boolean {
  if (!filters) return false;

  return (
    (filters.search ?? "").trim() !== "" ||
    (filters.status ?? "all") !== "all" ||
    (filters.priority ?? "all") !== "all"
  );
}

export function filterLeads(
  leads: AdminLeadListItem[] | null | undefined,
  filters: LeadFilters | null | undefined,
): AdminLeadListItem[] {
  const query = (filters?.search ?? "").trim().toLowerCase();
  const statusFilter = filters?.status ?? "all";
  const priorityFilter = filters?.priority ?? "all";

  return (leads ?? []).filter((lead) => {
    if (!lead) return false;
    if (statusFilter !== "all" && lead.status !== statusFilter) return false;
    if (priorityFilter !== "all" && lead.priority !== priorityFilter) return false;
    if (query === "") return true;

    return (
      toSearchableText(lead.title).includes(query) ||
      toSearchableText(lead.contact_email).includes(query) ||
      toSearchableText(lead.contact_name).includes(query)
    );
  });
}
