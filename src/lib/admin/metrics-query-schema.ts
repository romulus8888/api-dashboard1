import { z } from "zod";

export const MAX_METRICS_RANGE_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CANONICAL_UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const canonicalUtcTimestampSchema = z
  .string()
  .regex(CANONICAL_UTC_ISO_PATTERN, "Timestamp must be canonical UTC ISO ending with Z.")
  .refine(
    (value) => new Date(value).toISOString() === value,
    "Timestamp must be canonical UTC ISO ending with Z.",
  );

export const metricsQuerySchema = z
  .object({
    from: canonicalUtcTimestampSchema.optional(),
    to: canonicalUtcTimestampSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.from && !value.to) {
      return;
    }

    if ((value.from && !value.to) || (!value.from && value.to)) {
      ctx.addIssue({
        code: "custom",
        message: "Both from and to are required when specifying a custom range.",
        path: ["from"],
      });
      return;
    }

    const fromMs = Date.parse(value.from!);
    const toMs = Date.parse(value.to!);

    if (fromMs >= toMs) {
      ctx.addIssue({
        code: "custom",
        message: "from must be before to.",
        path: ["from"],
      });
    }

    if (toMs - fromMs > MAX_METRICS_RANGE_DAYS * MS_PER_DAY) {
      ctx.addIssue({
        code: "custom",
        message: `Range must not exceed ${MAX_METRICS_RANGE_DAYS} days.`,
        path: ["to"],
      });
    }
  });

export type MetricsQueryInput = z.infer<typeof metricsQuerySchema>;

export function resolveMetricsRange(input: MetricsQueryInput, now = new Date()): {
  from: string;
  to: string;
} {
  if (input.from && input.to) {
    return { from: input.from, to: input.to };
  }

  const to = now.toISOString();
  const from = new Date(now.getTime() - 30 * MS_PER_DAY).toISOString();
  return { from, to };
}
