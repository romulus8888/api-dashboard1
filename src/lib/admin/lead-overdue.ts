import type { LeadStatus } from "@/types/lead";

export const TERMINAL_LEAD_STATUSES: LeadStatus[] = ["won", "lost", "archived", "duplicate"];

export function isTerminalLeadStatus(status: LeadStatus): boolean {
  return TERMINAL_LEAD_STATUSES.includes(status);
}

export function isDeadlineOverdue(
  status: LeadStatus,
  dueAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!dueAt || isTerminalLeadStatus(status)) {
    return false;
  }

  return new Date(dueAt).getTime() < now.getTime();
}
