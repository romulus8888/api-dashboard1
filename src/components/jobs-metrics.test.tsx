import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { JobsMetrics } from "@/components/jobs-metrics";
import { LocaleProvider } from "@/i18n/locale-provider";
import { en } from "@/i18n/dictionaries/en";
import { ru } from "@/i18n/dictionaries/ru";
import type { LeadMetrics } from "@/types/metrics";

const metrics: LeadMetrics = {
  range: {
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-09-01T00:00:00.000Z",
    as_of: "2026-09-01T12:00:00.000Z",
  },
  funnel: { received: 10, started: 8, contacted: 6, qualified: 4, won: 2 },
  conversion: {
    overall: 0.2,
    received_to_started: 0.8,
    started_to_contacted: 0.75,
    contacted_to_qualified: 0.6667,
    qualified_to_won: 0.5,
  },
  sources: [
    { source: "demo_seed", received: 10, won: 2, conversion: 0.2 },
  ],
  timing: {
    first_action: { average_seconds: 3600, median_seconds: 1800, sample_size: 8 },
    first_terminal: { average_seconds: 86400, median_seconds: 72000, sample_size: 4 },
  },
  overdue: { first_response: 1, next_action: 2, total: 3 },
};

describe("JobsMetrics", () => {
  it("renders localized EN metrics tables", () => {
    render(
      <LocaleProvider locale="en" dictionary={en}>
        <JobsMetrics metrics={metrics} loading={false} loadError={null} onRetry={() => {}} />
      </LocaleProvider>,
    );

    expect(screen.getByRole("region", { name: en.leads.metrics.title })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: en.leads.metrics.funnel.stage })).toBeTruthy();
    expect(screen.getByText(en.leads.metrics.sources.title)).toBeTruthy();
  });

  it("renders localized RU empty state", () => {
    render(
      <LocaleProvider locale="ru" dictionary={ru}>
        <JobsMetrics metrics={null} loading={false} loadError={null} onRetry={() => {}} />
      </LocaleProvider>,
    );

    expect(screen.getByText(ru.leads.metrics.emptyTitle)).toBeTruthy();
  });

  it("shows API failure copy", () => {
    render(
      <LocaleProvider locale="en" dictionary={en}>
        <JobsMetrics
          metrics={null}
          loading={false}
          loadError={en.leads.metrics.loadFailed}
          onRetry={() => {}}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText(en.leads.metrics.loadFailed)).toBeTruthy();
  });
});
