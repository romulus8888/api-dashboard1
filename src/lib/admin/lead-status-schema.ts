import { z } from "zod";

import { LEAD_STATUSES } from "@/types/lead";

export const MAX_STATUS_REASON_LENGTH = 500;

export const leadStatusTransitionSchema = z
  .object({
    status: z.enum(LEAD_STATUSES),
    reason: z
      .string()
      .trim()
      .min(1, "Reason must not be blank when provided.")
      .max(MAX_STATUS_REASON_LENGTH)
      .optional(),
  })
  .strict();

export type LeadStatusTransitionInput = z.infer<typeof leadStatusTransitionSchema>;
