"use client";

import { AlertTriangle, Clock3, Layers3 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useLocaleContext } from "@/i18n/locale-provider";
import {
  formatDurationSeconds,
  formatInteger,
  formatMetricsDateRange,
  formatPercent,
} from "@/lib/admin/metrics-format";
import type { LeadMetrics } from "@/types/metrics";
import type { LeadSource } from "@/types/lead";

export interface JobsMetricsProps {
  metrics: LeadMetrics | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
}

const FUNNEL_STAGES = ["received", "started", "contacted", "qualified", "won"] as const;

export function JobsMetrics({ metrics, loading, loadError, onRetry }: JobsMetricsProps) {
  const { locale, dictionary } = useLocaleContext();
  const labels = dictionary.leads.metrics;

  if (loading) {
    return (
      <section aria-label={labels.title} className="space-y-4">
        <Skeleton className="h-6 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section
        aria-label={labels.title}
        className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
      >
        <p>{loadError}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 transition hover:bg-rose-100"
        >
          {dictionary.leads.error.tryAgain}
        </button>
      </section>
    );
  }

  if (!metrics) {
    return null;
  }

  const cohortEmpty = metrics.funnel.received === 0;
  const rangeLabel = formatMetricsDateRange(metrics.range.from, metrics.range.to, locale);

  const funnelRows = FUNNEL_STAGES.map((stage) => ({
    stage,
    count: metrics.funnel[stage],
    label: labels.funnel[stage],
    conversion:
      stage === "received"
        ? null
        : metrics.conversion[
            stage === "started"
              ? "received_to_started"
              : stage === "contacted"
                ? "started_to_contacted"
                : stage === "qualified"
                  ? "contacted_to_qualified"
                  : "qualified_to_won"
          ],
  }));

  return (
    <section aria-label={labels.title} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{labels.title}</h2>
          <p className="text-sm text-slate-500">
            {labels.rangeLabel.replace("{range}", rangeLabel)}
          </p>
        </div>
        <p className="text-sm font-medium text-slate-700">
          {labels.conversion.overall}: {formatPercent(metrics.conversion.overall, locale)}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Layers3 className="size-4 text-indigo-600" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-900">{labels.funnel.title}</h3>
          </div>
          {cohortEmpty ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
              <p className="text-sm font-medium text-slate-800">{labels.emptyTitle}</p>
              <p className="mt-1 text-sm text-slate-500">{labels.emptyDescription}</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  <th scope="col" className="pb-2">{labels.funnel.stage}</th>
                  <th scope="col" className="pb-2 text-right">{labels.funnel.count}</th>
                  <th scope="col" className="pb-2 text-right">{labels.funnel.conversion}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {funnelRows.map((row) => (
                  <tr key={row.stage}>
                    <th scope="row" className="py-2.5 font-medium text-slate-800">{row.label}</th>
                    <td className="py-2.5 text-right tabular-nums text-slate-900">
                      {formatInteger(row.count, locale)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-600">
                      {row.conversion === null
                        ? "—"
                        : formatPercent(row.conversion, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Clock3 className="size-4 text-indigo-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-900">{labels.timing.title}</h3>
            </div>
            <dl className="space-y-4 text-sm">
              <TimingBlock
                title={labels.timing.firstAction}
                bucket={metrics.timing.first_action}
                labels={labels.timing}
                locale={locale}
              />
              <TimingBlock
                title={labels.timing.firstTerminal}
                bucket={metrics.timing.first_terminal}
                labels={labels.timing}
                locale={locale}
              />
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-900">{labels.overdue.title}</h3>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <MetricStat label={labels.overdue.firstResponse} value={metrics.overdue.first_response} locale={locale} />
              <MetricStat label={labels.overdue.nextAction} value={metrics.overdue.next_action} locale={locale} />
              <MetricStat label={labels.overdue.total} value={metrics.overdue.total} locale={locale} />
            </dl>
          </div>
        </div>
      </div>

      {!cohortEmpty && metrics.sources.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">{labels.sources.title}</h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th scope="col" className="pb-2">{labels.sources.source}</th>
                <th scope="col" className="pb-2 text-right">{labels.sources.received}</th>
                <th scope="col" className="pb-2 text-right">{labels.sources.won}</th>
                <th scope="col" className="pb-2 text-right">{labels.sources.conversion}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.sources.map((row) => (
                <tr key={row.source}>
                  <th scope="row" className="py-2.5 font-medium text-slate-800">
                    {dictionary.leads.source[row.source as LeadSource]}
                  </th>
                  <td className="py-2.5 text-right tabular-nums">{formatInteger(row.received, locale)}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatInteger(row.won, locale)}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatPercent(row.conversion, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function TimingBlock({
  title,
  bucket,
  labels,
  locale,
}: {
  title: string;
  bucket: LeadMetrics["timing"]["first_action"];
  labels: {
    average: string;
    median: string;
    sampleSize: string;
    noSamples: string;
  };
  locale: "en" | "ru";
}) {
  if (bucket.sample_size === 0) {
    return (
      <div>
        <dt className="font-medium text-slate-800">{title}</dt>
        <dd className="mt-1 text-slate-500">{labels.noSamples}</dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="font-medium text-slate-800">{title}</dt>
      <dd className="mt-2 grid gap-2 sm:grid-cols-3">
        <div>
          <span className="text-xs text-slate-500">{labels.average}</span>
          <p className="tabular-nums text-slate-900">
            {formatDurationSeconds(bucket.average_seconds, locale)}
          </p>
        </div>
        <div>
          <span className="text-xs text-slate-500">{labels.median}</span>
          <p className="tabular-nums text-slate-900">
            {formatDurationSeconds(bucket.median_seconds, locale)}
          </p>
        </div>
        <div>
          <span className="text-xs text-slate-500">{labels.sampleSize}</span>
          <p className="tabular-nums text-slate-900">{formatInteger(bucket.sample_size, locale)}</p>
        </div>
      </dd>
    </div>
  );
}

function MetricStat({
  label,
  value,
  locale,
}: {
  label: string;
  value: number;
  locale: "en" | "ru";
}) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {formatInteger(value, locale)}
      </dd>
    </div>
  );
}
