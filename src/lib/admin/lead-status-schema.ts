import { z } from "zod";

import { LEAD_STATUSES } from "@/types/lead";

export const MAX_STATUS_REASON_LENGTH = 500;

export const leadStatusTransitionSchema = z
  .object({
    status: z.enum(LEAD_STATUSES),
    reason: z.string().trim().max(MAX_STATUS_REASON_LENGTH).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const reason = value.reason?.trim() ?? "";

    if (value.status === "lost") {
      if (reason.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Reason is required when marking a lead as lost.",
          path: ["reason"],
        });
      }
      return;
    }

    if (value.reason !== undefined && reason.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Reason must not be blank when provided.",
        path: ["reason"],
      });
    }
  });

export type LeadStatusTransitionInput = z.infer<typeof leadStatusTransitionSchema>;
