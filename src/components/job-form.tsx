"use client";

import { useState } from "react";
import { useForm, type DefaultValues, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2, Send } from "lucide-react";

import { ToastProvider, useToast } from "@/components/ui/toast";
import {
  jobRequestSchema,
  type JobRequestInput,
  type JobRequestValues,
} from "@/lib/job-request-schema";
import { createJob, JobsApiError } from "@/lib/jobs";
import { logger } from "@/lib/logger";
import { cn, getErrorMessage } from "@/lib/utils";
import { JOB_PRIORITIES, JOB_PRIORITY_LABELS, type JobPriority } from "@/types/job";

const LOG_SCOPE = "job-form";

const DEFAULT_VALUES: DefaultValues<JobRequestInput> = {
  title: "",
  description: "",
  priority: "medium",
  client_email: "",
};

const PRIORITY_STYLES: Record<JobPriority, string> = {
  low: "peer-checked:border-slate-400 peer-checked:bg-slate-50 peer-checked:text-slate-700",
  medium: "peer-checked:border-amber-400 peer-checked:bg-amber-50 peer-checked:text-amber-700",
  high: "peer-checked:border-rose-400 peer-checked:bg-rose-50 peer-checked:text-rose-700",
};

const INPUT_BASE =
  "w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50";

const INPUT_VALID = "border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10";

const INPUT_INVALID = "border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10";

function inputClasses(invalid: boolean, extra?: string): string {
  return cn(INPUT_BASE, invalid ? INPUT_INVALID : INPUT_VALID, extra);
}

export default function JobForm() {
  return (
    <ToastProvider>
      <JobRequestForm />
    </ToastProvider>
  );
}

function JobRequestForm() {
  const { toast } = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<JobRequestInput, unknown, JobRequestValues>({
    resolver: zodResolver(jobRequestSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onTouched",
  });

  async function onValid(values: JobRequestValues) {
    setSubmitError(null);

    try {
      const job = await createJob(values);

      logger.info(LOG_SCOPE, "Job request submitted", {
        id: job.id,
        priority: job.priority,
        budget: job.budget,
      });

      toast({
        variant: "success",
        title: "Request submitted",
        description: "Your job is in the queue and now visible on the dashboard.",
      });

      reset(DEFAULT_VALUES);
    } catch (error) {
      // Deliberately no reset here, so a failed submit never costs the user their input.
      const message = getErrorMessage(error);

      logger.error(LOG_SCOPE, "Job request failed", {
        message,
        code: error instanceof JobsApiError ? error.code : undefined,
        details: error instanceof JobsApiError ? error.details : undefined,
      });

      setSubmitError(message);

      toast({
        variant: "error",
        title: "We couldn't submit your request",
        description: message,
      });
    }
  }

  function onInvalid(fieldErrors: FieldErrors<JobRequestInput>) {
    logger.info(LOG_SCOPE, "Submit blocked by validation", {
      fields: Object.keys(fieldErrors),
    });
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          Submit a project request
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Tell us what you need. Our team reviews every request within one business day.
        </p>
      </div>

      {submitError ? (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">We couldn&apos;t submit your request.</p>
            <p className="mt-0.5 break-words text-rose-700">{submitError}</p>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onValid, onInvalid)} noValidate>
        <fieldset disabled={isSubmitting} className="space-y-5">
          <legend className="sr-only">Project request details</legend>

          <div>
            <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-slate-700">
              Project title
            </label>
            <input
              id="title"
              type="text"
              placeholder="Migrate billing API to v2"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? "title-error" : undefined}
              className={inputClasses(Boolean(errors.title))}
              {...register("title")}
            />
            <FieldError id="title-error">{errors.title?.message}</FieldError>
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              placeholder="Share scope, deadlines, and anything else we should know."
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? "description-error" : undefined}
              className={inputClasses(Boolean(errors.description), "resize-y")}
              {...register("description")}
            />
            <FieldError id="description-error">{errors.description?.message}</FieldError>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="budget" className="mb-1.5 block text-sm font-medium text-slate-700">
                Budget (USD)
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-slate-400">
                  $
                </span>
                <input
                  id="budget"
                  type="number"
                  min="0"
                  step="100"
                  inputMode="decimal"
                  placeholder="5000"
                  aria-invalid={Boolean(errors.budget)}
                  aria-describedby={errors.budget ? "budget-error" : undefined}
                  className={inputClasses(Boolean(errors.budget), "pl-8")}
                  {...register("budget", { valueAsNumber: true })}
                />
              </div>
              <FieldError id="budget-error">{errors.budget?.message}</FieldError>
            </div>

            <div>
              <label
                htmlFor="client_email"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Work email
              </label>
              <input
                id="client_email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                aria-invalid={Boolean(errors.client_email)}
                aria-describedby={errors.client_email ? "client_email-error" : undefined}
                className={inputClasses(Boolean(errors.client_email))}
                {...register("client_email")}
              />
              <FieldError id="client_email-error">{errors.client_email?.message}</FieldError>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700" id="priority-label">
              Priority
            </p>
            <div
              role="radiogroup"
              aria-labelledby="priority-label"
              aria-describedby={errors.priority ? "priority-error" : undefined}
              className="grid grid-cols-3 gap-3"
            >
              {JOB_PRIORITIES.map((priority) => (
                <div key={priority}>
                  <input
                    id={`priority-${priority}`}
                    type="radio"
                    value={priority}
                    className="peer sr-only"
                    {...register("priority")}
                  />
                  <label
                    htmlFor={`priority-${priority}`}
                    className={cn(
                      "flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 peer-focus-visible:ring-4 peer-focus-visible:ring-indigo-500/20 peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
                      PRIORITY_STYLES[priority],
                    )}
                  >
                    {JOB_PRIORITY_LABELS[priority]}
                  </label>
                </div>
              ))}
            </div>
            <FieldError id="priority-error">{errors.priority?.message}</FieldError>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Submitting…
              </>
            ) : (
              <>
                <Send className="size-4" aria-hidden="true" />
                Submit request
              </>
            )}
          </button>

          <p className="text-center text-xs text-slate-400">
            By submitting you agree to be contacted about this request.
          </p>
        </fieldset>
      </form>
    </div>
  );
}

function FieldError({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;

  return (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600">
      <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}
