import { z } from "zod";

import { LEAD_PRIORITIES } from "@/types/lead";

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const leadPatchSchema = z
  .object({
    owner_id: z.uuid().nullable().optional(),
    priority: z.enum(LEAD_PRIORITIES).optional(),
    next_action_at: isoDateTimeSchema.nullable().optional(),
    first_response_due_at: isoDateTimeSchema.nullable().optional(),
    updated_at: isoDateTimeSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.owner_id !== undefined ||
      value.priority !== undefined ||
      value.next_action_at !== undefined ||
      value.first_response_due_at !== undefined,
    { message: "At least one updatable field is required." },
  );

export type LeadPatchInput = z.infer<typeof leadPatchSchema>;
