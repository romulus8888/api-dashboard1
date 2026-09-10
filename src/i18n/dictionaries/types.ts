import type { Locale } from "@/i18n/config";
import type { DemoApiErrorCode } from "@/types/api-errors";
import type { JobPriority, JobStatus } from "@/types/job";

export interface Dictionary {
  locale: Locale;
  metadata: {
    siteName: string;
    homeTitle: string;
    homeDescription: string;
    dashboardTitle: string;
    dashboardDescription: string;
    titleTemplate: string;
  };
  common: {
    brand: string;
    dashboard: string;
    backToSite: string;
    adminDashboard: string;
    copyright: string;
    localeSwitcherLabel: string;
    localeEn: string;
    localeRu: string;
  };
  prototype: {
    bannerStrong: string;
    banner: string;
  };
  landing: {
    badge: string;
    title: string;
    description: string;
    generateCta: string;
    viewDashboardCta: string;
    features: {
      synthetic: { title: string; description: string };
      claim: { title: string; description: string };
      tracking: { title: string; description: string };
    };
  };
  demo: {
    title: string;
    description: string;
    note: string;
    errorTitle: string;
    latestLeadTitle: string;
    persona: string;
    project: string;
    priority: string;
    locale: string;
    demoLocaleLabel: string;
    localeEnglish: string;
    localeRussian: string;
    verification: string;
    turnstileMissing: string;
    verificationRequired: string;
    generating: string;
    generateButton: string;
    footerNote: string;
    toastSuccessTitle: string;
    toastSuccessDescription: string;
    toastErrorTitle: string;
    retryAfterSeconds: string;
  };
  dashboard: {
    title: string;
    subtitle: string;
    showingCount: string;
    showingCountSingular: string;
    showingCountPlural: string;
  };
  jobs: {
    stats: {
      total: string;
      pending: string;
      inProgress: string;
      completed: string;
    };
    table: {
      job: string;
      client: string;
      priority: string;
      budget: string;
      created: string;
      status: string;
      viewDetails: string;
      savingStatus: string;
      statusFor: string;
    };
    filters: {
      searchPlaceholder: string;
      searchLabel: string;
      clearSearch: string;
      allStatuses: string;
      allPriorities: string;
      reset: string;
      refresh: string;
      statusFilter: string;
      priorityFilter: string;
    };
    empty: {
      noneTitle: string;
      noneDescription: string;
      filteredTitle: string;
      filteredDescription: string;
      clearFilters: string;
    };
    error: {
      title: string;
      tryAgain: string;
      loadFailed: string;
      updateFailed: string;
      refreshFailed: string;
    };
    detail: {
      submittedBy: string;
      close: string;
      description: string;
      status: string;
      saving: string;
      changesSaveImmediately: string;
      details: string;
      clientEmail: string;
      budget: string;
      created: string;
      requestId: string;
      startProgress: string;
      markCompleted: string;
    };
    toasts: {
      statusUpdatedTitle: string;
      statusUpdatedDescription: string;
      statusUpdateFailedTitle: string;
      refreshFailedTitle: string;
    };
    status: Record<JobStatus, string>;
    priority: Record<JobPriority, string>;
  };
  errors: {
    api: Record<DemoApiErrorCode, string>;
  };
}
