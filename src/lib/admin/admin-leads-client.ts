import type {
  ActiveOperatorOption,
  Lead,
  LeadComment,
  LeadPriority,
  LeadStatus,
  LeadStatusHistoryEntry,
} from "@/types/lead";
import type { LeadMetrics } from "@/types/metrics";

export type AdminLeadListItem = Pick<
  Lead,
  | "id"
  | "status"
  | "priority"
  | "source"
  | "locale"
  | "contact_name"
  | "contact_email"
  | "title"
  | "budget_amount"
  | "budget_currency"
  | "owner_id"
  | "next_action_at"
  | "first_response_due_at"
  | "is_synthetic"
  | "created_at"
  | "updated_at"
>;

export type AdminLeadDetail = Lead;

export type AdminLeadsErrorCode =
  | "session_expired"
  | "forbidden"
  | "invalid_payload"
  | "not_found"
  | "conflict"
  | "request_failed";

export class AdminLeadsApiError extends Error {
  readonly code: AdminLeadsErrorCode;
  readonly status: number;

  constructor(code: AdminLeadsErrorCode, status: number) {
    super(code);
    this.name = "AdminLeadsApiError";
    this.code = code;
    this.status = status;
  }
}

export interface AdminLeadPatchInput {
  owner_id?: string | null;
  priority?: LeadPriority;
  next_action_at?: string | null;
  first_response_due_at?: string | null;
  updated_at?: string;
}

interface ListLeadsResponse {
  data: AdminLeadListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface LeadDetailResponse {
  data: AdminLeadDetail;
}

interface OperatorsResponse {
  data: ActiveOperatorOption[];
}

interface LeadHistoryResponse {
  data: LeadStatusHistoryEntry[];
}

interface LeadCommentsResponse {
  data: LeadComment[];
}

interface LeadCommentResponse {
  data: LeadComment;
}

interface MetricsResponse {
  data: LeadMetrics;
}

async function parseErrorCode(response: Response): Promise<AdminLeadsErrorCode> {
  try {
    const payload = (await response.json()) as { error?: string };

    if (response.status === 401) {
      return "session_expired";
    }

    if (response.status === 403) {
      return "forbidden";
    }

    if (response.status === 404) {
      return "not_found";
    }

    if (response.status === 409) {
      return "conflict";
    }

    if (response.status === 400) {
      return "invalid_payload";
    }

    if (typeof payload.error === "string") {
      return "request_failed";
    }
  } catch {
    // Fall through to generic mapping below.
  }

  if (response.status === 401) {
    return "session_expired";
  }

  if (response.status === 409) {
    return "conflict";
  }

  return "request_failed";
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new AdminLeadsApiError(await parseErrorCode(response), response.status);
  }

  return (await response.json()) as T;
}

export async function fetchAdminLeads(): Promise<AdminLeadListItem[]> {
  const payload = await requestJson<ListLeadsResponse>(
    "/api/admin/leads?pageSize=100&sortBy=created_at&sortDir=desc",
  );

  return payload.data;
}

export async function fetchAdminLead(id: string): Promise<AdminLeadDetail> {
  const payload = await requestJson<LeadDetailResponse>(`/api/admin/leads/${id}`);
  return payload.data;
}

export async function fetchAdminMetrics(): Promise<LeadMetrics> {
  const payload = await requestJson<MetricsResponse>("/api/admin/metrics");
  return payload.data;
}

export async function fetchAdminOperators(): Promise<ActiveOperatorOption[]> {
  const payload = await requestJson<OperatorsResponse>("/api/admin/operators");
  return payload.data;
}

export async function patchAdminLead(
  id: string,
  input: AdminLeadPatchInput,
): Promise<AdminLeadDetail> {
  const payload = await requestJson<LeadDetailResponse>(`/api/admin/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return payload.data;
}

export async function fetchAdminLeadHistory(id: string): Promise<LeadStatusHistoryEntry[]> {
  const payload = await requestJson<LeadHistoryResponse>(`/api/admin/leads/${id}/history`);
  return payload.data;
}

export async function fetchAdminLeadComments(id: string): Promise<LeadComment[]> {
  const payload = await requestJson<LeadCommentsResponse>(`/api/admin/leads/${id}/comments`);
  return payload.data;
}

export async function createAdminLeadComment(id: string, body: string): Promise<LeadComment> {
  const payload = await requestJson<LeadCommentResponse>(`/api/admin/leads/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

  return payload.data;
}

export async function updateAdminLeadStatus(
  id: string,
  status: LeadStatus,
  reason?: string,
): Promise<AdminLeadDetail> {
  const payload = await requestJson<LeadDetailResponse>(`/api/admin/leads/${id}/status`, {
    method: "POST",
    body: JSON.stringify(reason ? { status, reason } : { status }),
  });

  return payload.data;
}
