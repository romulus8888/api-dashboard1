"use client";

import { useRef, useState } from "react";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import { ToastProvider, useToast } from "@/components/ui/toast";
import { useLocaleContext } from "@/i18n/locale-provider";
import { logger } from "@/lib/logger";
import { mapDemoApiError } from "@/lib/map-demo-api-error";
import { cn } from "@/lib/utils";
import { isDemoApiErrorCode } from "@/types/api-errors";
import type { DemoLeadSummary, LeadLocale } from "@/types/lead";

const LOG_SCOPE = "demo-lead-generator";

interface GenerateLeadResponse {
  lead: DemoLeadSummary;
}

interface GenerateLeadErrorResponse {
  error: string;
}

export default function DemoLeadGenerator() {
  return (
    <ToastProvider>
      <DemoLeadGeneratorForm />
    </ToastProvider>
  );
}

function DemoLeadGeneratorForm() {
  const { locale, dictionary } = useLocaleContext();
  const { toast } = useToast();
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [demoLocale, setDemoLocale] = useState<LeadLocale>(locale);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [generatedLead, setGeneratedLead] = useState<DemoLeadSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const labels = dictionary.demo;
  const priorityLabels = dictionary.jobs.priority;

  async function handleGenerate() {
    setSubmitError(null);
    setGeneratedLead(null);

    if (!turnstileToken) {
      setSubmitError(dictionary.errors.api.verification_required);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/demo/generate-lead", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          locale: demoLocale,
          turnstileToken,
        }),
      });

      const payload = (await response.json()) as GenerateLeadResponse | GenerateLeadErrorResponse;

      if (!response.ok) {
        const errorPayload = payload as GenerateLeadErrorResponse;
        const errorCode =
          typeof errorPayload.error === "string" && isDemoApiErrorCode(errorPayload.error)
            ? errorPayload.error
            : "generation_failed";
        let message = mapDemoApiError(dictionary, errorCode);

        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          if (retryAfter) {
            message = `${message} ${labels.retryAfterSeconds.replace("{seconds}", retryAfter)}`;
          }
        }

        throw new Error(message);
      }

      const lead = (payload as GenerateLeadResponse).lead;
      setGeneratedLead(lead);

      logger.info(LOG_SCOPE, "Demo lead generated in UI", {
        id: lead.id,
        locale: lead.locale,
      });

      toast({
        variant: "success",
        title: labels.toastSuccessTitle,
        description: labels.toastSuccessDescription,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : mapDemoApiError(dictionary, "generation_failed");
      setSubmitError(message);

      logger.error(LOG_SCOPE, "Demo lead generation failed in UI", { message });

      toast({
        variant: "error",
        title: labels.toastErrorTitle,
        description: message,
      });
    } finally {
      setIsSubmitting(false);
      turnstileRef.current?.reset();
      setTurnstileToken(null);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{labels.title}</h2>
        <p className="mt-1 text-sm text-slate-500">{labels.description}</p>
      </div>

      <div
        role="note"
        className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900"
      >
        {labels.note}
      </div>

      {submitError ? (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">{labels.errorTitle}</p>
            <p className="mt-0.5 break-words text-rose-700">{submitError}</p>
          </div>
        </div>
      ) : null}

      {generatedLead ? (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          <p className="font-medium">{labels.latestLeadTitle}</p>
          <dl className="mt-3 space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-emerald-800">{labels.persona}</dt>
              <dd className="font-medium">{generatedLead.personaLabel}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-emerald-800">{labels.project}</dt>
              <dd className="text-right font-medium">{generatedLead.title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-emerald-800">{labels.priority}</dt>
              <dd className="font-medium">{priorityLabels[generatedLead.priority]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-emerald-800">{labels.locale}</dt>
              <dd className="font-medium uppercase">{generatedLead.locale}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="space-y-5">
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700" id="locale-label">
            {labels.demoLocaleLabel}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="locale-label"
            className="grid grid-cols-2 gap-3"
          >
            {(["en", "ru"] as const).map((value) => (
              <div key={value}>
                <input
                  id={`locale-${value}`}
                  type="radio"
                  name="locale"
                  value={value}
                  checked={demoLocale === value}
                  onChange={() => setDemoLocale(value)}
                  className="peer sr-only"
                  disabled={isSubmitting}
                />
                <label
                  htmlFor={`locale-${value}`}
                  className={cn(
                    "flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 peer-checked:border-indigo-400 peer-checked:bg-indigo-50 peer-checked:text-indigo-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
                  )}
                >
                  {value === "en" ? labels.localeEnglish : labels.localeRussian}
                </label>
              </div>
            ))}
          </div>
        </div>

        {siteKey ? (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">{labels.verification}</p>
            <Turnstile
              ref={turnstileRef}
              siteKey={siteKey}
              onSuccess={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
              options={{ theme: "light" }}
            />
          </div>
        ) : (
          <p className="text-sm text-amber-700">{labels.turnstileMissing}</p>
        )}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isSubmitting || !turnstileToken}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {labels.generating}
            </>
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden="true" />
              {labels.generateButton}
            </>
          )}
        </button>

        <p className="text-center text-xs text-slate-400">{labels.footerNote}</p>
      </div>
    </div>
  );
}
