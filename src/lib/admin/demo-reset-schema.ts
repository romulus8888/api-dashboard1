import { z } from "zod";

export const DEMO_RESET_CONFIRMATION = "reset-synthetic-demo";

export const demoResetSchema = z
  .object({
    confirm: z.literal(DEMO_RESET_CONFIRMATION),
  })
  .strict();
