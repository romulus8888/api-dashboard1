import { z } from "zod";

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const MAX_METRICS_RANGE_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const metricsQuerySchema = z
  .object({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
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
