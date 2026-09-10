import { z } from "zod";

import { LEAD_LOCALES } from "@/types/lead";

export const MAX_GENERATE_LEAD_BODY_BYTES = 1024;

export const generateLeadRequestSchema = z
  .object({
    locale: z.enum(LEAD_LOCALES),
    turnstileToken: z.string().trim().min(1, "Turnstile token is required."),
  })
  .strict();

export type GenerateLeadRequest = z.infer<typeof generateLeadRequestSchema>;
