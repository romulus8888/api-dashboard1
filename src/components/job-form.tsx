"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { JOB_PRIORITIES, JOB_PRIORITY_LABELS, type JobPriority } from "@/types/job";

interface FormValues {
  title: string;
  description: string;
  budget: string;
  priority: JobPriority;
  client_email: string;
}

type FieldErrors = Partial<Record<keyof FormValues, string>>;

const EMPTY_FORM: FormValues = {
  title: "",
  description: "",
  budget: "",
  priority: "medium",
  client_email: "",
};

const PRIORITY_STYLES: Record<JobPriority, string> = {
  low: "peer-checked:border-slate-400 peer-checked:bg-slate-50 peer-checked:text-slate-700",
  medium: "peer-checked:border-amber-400 peer-checked:bg-amber-50 peer-checked:text-amber-700",
  high: "peer-checked:border-rose-400 peer-checked:bg-rose-50 peer-checked:text-rose-700",
};

const inputClasses =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50";

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.title.trim()) {
    errors.title = "Please give the project a title.";
  } else if (values.title.trim().length < 3) {
    errors.title = "Title must be at least 3 characters.";
  }

  if (!values.description.trim()) {
    errors.description = "Tell us a little about the work.";
  } else if (values.description.trim().length < 10) {
    errors.description = "Description must be at least 10 characters.";
  }

  const budget = Number(values.budget);
  if (!values.budget.trim()) {
    errors.budget = "Please enter a budget.";
  } else if (!Number.isFinite(budget) || budget <= 0) {
    errors.budget = "Budget must be a positive number.";
  }

  if (!values.client_email.trim()) {
    errors.client_email = "We need an email to reply to.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.client_email.trim())) {
    errors.client_email = "Enter a valid email address.";
  }

  return errors;
}

export default function JobForm() {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!showSuccess) return;
    const timer = window.setTimeout(() => setShowSuccess(false), 6000);
    return () => window.clearTimeout(timer);
  }, [showSuccess]);

  function updateField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);

    const { error } = await supabase.from("jobs").insert({
      title: values.title.trim(),
      description: values.description.trim(),
      budget: Number(values.budget),
      priority: values.priority,
      client_email: values.client_email.trim().toLowerCase(),
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    setValues(EMPTY_FORM);
    setShowSuccess(true);
  }

  return (
    <>
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
              <p className="mt-0.5 text-rose-700">{submitError}</p>
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-slate-700">
              Project title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              value={values.title}
              onChange={(event) => updateField("title", event.target.value)}
              disabled={submitting}
              placeholder="Migrate billing API to v2"
              aria-invalid={Boolean(errors.title)}
              className={inputClasses}
            />
            {errors.title ? <FieldError>{errors.title}</FieldError> : null}
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
              name="description"
              rows={4}
              value={values.description}
              onChange={(event) => updateField("description", event.target.value)}
              disabled={submitting}
              placeholder="Share scope, deadlines, and anything else we should know."
              aria-invalid={Boolean(errors.description)}
              className={`${inputClasses} resize-y`}
            />
            {errors.description ? <FieldError>{errors.description}</FieldError> : null}
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
                  name="budget"
                  type="number"
                  min="0"
                  step="100"
                  inputMode="decimal"
                  value={values.budget}
                  onChange={(event) => updateField("budget", event.target.value)}
                  disabled={submitting}
                  placeholder="5000"
                  aria-invalid={Boolean(errors.budget)}
                  className={`${inputClasses} pl-8`}
                />
              </div>
              {errors.budget ? <FieldError>{errors.budget}</FieldError> : null}
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
                name="client_email"
                type="email"
                autoComplete="email"
                value={values.client_email}
                onChange={(event) => updateField("client_email", event.target.value)}
                disabled={submitting}
                placeholder="you@company.com"
                aria-invalid={Boolean(errors.client_email)}
                className={inputClasses}
              />
              {errors.client_email ? <FieldError>{errors.client_email}</FieldError> : null}
            </div>
          </div>

          <fieldset disabled={submitting}>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Priority</legend>
            <div className="grid grid-cols-3 gap-3">
              {JOB_PRIORITIES.map((priority) => (
                <div key={priority}>
                  <input
                    id={`priority-${priority}`}
                    type="radio"
                    name="priority"
                    value={priority}
                    checked={values.priority === priority}
                    onChange={() => updateField("priority", priority)}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={`priority-${priority}`}
                    className={`flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 peer-focus-visible:ring-4 peer-focus-visible:ring-indigo-500/20 ${PRIORITY_STYLES[priority]}`}
                  >
                    {JOB_PRIORITY_LABELS[priority]}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
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
        </form>
      </div>

      {showSuccess ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-6 z-50 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl shadow-slate-900/10 sm:inset-x-auto sm:right-6 sm:w-96"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Request submitted</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Thanks! Your job is now in the queue and visible on the dashboard.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSuccess(false)}
            aria-label="Dismiss notification"
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600">
      <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}
