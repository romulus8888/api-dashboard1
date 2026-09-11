import { z } from "zod";

export const MAX_COMMENT_BODY_LENGTH = 2000;

export const leadCommentCreateSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, "Comment body must not be blank.")
      .max(MAX_COMMENT_BODY_LENGTH),
  })
  .strict();

export type LeadCommentCreateInput = z.infer<typeof leadCommentCreateSchema>;
