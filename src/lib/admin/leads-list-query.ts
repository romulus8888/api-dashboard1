import { z } from "zod";

import {
  LEAD_LOCALES,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
} from "@/types/lead";

export const MAX_ADMIN_PAGE_SIZE = 100;
export const DEFAULT_ADMIN_PAGE_SIZE = 20;

export const leadsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_ADMIN_PAGE_SIZE)
    .default(DEFAULT_ADMIN_PAGE_SIZE),
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  locale: z.enum(LEAD_LOCALES).optional(),
  isSynthetic: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  sortBy: z.enum(["created_at", "updated_at", "status"]).default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type LeadsListQuery = z.infer<typeof leadsListQuerySchema>;

export function parseLeadsListQuery(searchParams: URLSearchParams): LeadsListQuery {
  return leadsListQuerySchema.parse({
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    priority: searchParams.get("priority") ?? undefined,
    source: searchParams.get("source") ?? undefined,
    locale: searchParams.get("locale") ?? undefined,
    isSynthetic: searchParams.get("isSynthetic") ?? undefined,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortDir: searchParams.get("sortDir") ?? undefined,
  });
}
