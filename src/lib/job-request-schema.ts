import { z } from "zod";

import { JOB_PRIORITIES } from "@/types/job";

/**
 * Single source of truth for request-form validation. Messages are written as
 * user-facing copy because they render directly under each input.
 */
export const jobRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Please give the project a title.")
    .min(5, "Title must be at least 5 characters."),

  description: z
    .string()
    .trim()
    .min(1, "Tell us a little about the work.")
    .min(10, "Description must be at least 10 characters."),

  // `valueAsNumber` yields NaN for an empty input, which fails the base type check.
  budget: z.number({ error: "Please enter a budget." }).gt(0, "Budget must be greater than 0."),

  priority: z.enum(JOB_PRIORITIES, { error: "Choose a priority." }),

  client_email: z
    .string()
    .trim()
    .min(1, "We need an email to reply to.")
    .pipe(z.email("Enter a valid email address."))
    .transform((value) => value.toLowerCase()),
});

/** What the inputs produce, before zod trims and normalises. */
export type JobRequestInput = z.input<typeof jobRequestSchema>;

/** What the submit handler receives: trimmed, lowercased, and fully typed. */
export type JobRequestValues = z.output<typeof jobRequestSchema>;
