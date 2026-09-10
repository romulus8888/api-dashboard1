import type { Lead, LeadStatus } from "@/types/lead";

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

export async function updateAdminLeadStatus(
  id: string,
  status: LeadStatus,
): Promise<AdminLeadDetail> {
  const payload = await requestJson<LeadDetailResponse>(`/api/admin/leads/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });

  return payload.data;
}
