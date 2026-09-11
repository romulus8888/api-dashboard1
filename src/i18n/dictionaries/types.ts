import type { Locale } from "@/i18n/config";
import type { DemoApiErrorCode } from "@/types/api-errors";
import type { LeadPriority, LeadSource, LeadStatus } from "@/types/lead";

export type LoginErrorCode = "invalid_credentials" | "invalid_payload" | "auth_not_configured";

export interface Dictionary {
  locale: Locale;
  metadata: {
    siteName: string;
    homeTitle: string;
    homeDescription: string;
    dashboardTitle: string;
    dashboardDescription: string;
    loginTitle: string;
    loginDescription: string;
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
    logout: string;
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
  auth: {
    emailLabel: string;
    passwordLabel: string;
    signIn: string;
    signingIn: string;
    invalidCredentials: string;
    invalidPayload: string;
    authNotConfigured: string;
    forbiddenTitle: string;
    forbiddenDescription: string;
  };
  dashboard: {
    title: string;
    subtitle: string;
    showingCount: string;
    showingCountSingular: string;
    showingCountPlural: string;
  };
  leads: {
    stats: {
      total: string;
      new: string;
      inProgress: string;
      won: string;
    };
    syntheticBadge: string;
    overdue: string;
    unassigned: string;
    table: {
      lead: string;
      contact: string;
      source: string;
      owner: string;
      priority: string;
      budget: string;
      created: string;
      firstResponse: string;
      nextAction: string;
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
      sessionExpired: string;
      forbidden: string;
      updateFailed: string;
      refreshFailed: string;
      patchFailed: string;
      conflict: string;
      commentFailed: string;
    };
    detail: {
      submittedBy: string;
      close: string;
      description: string;
      status: string;
      saving: string;
      changesSaveImmediately: string;
      details: string;
      contactEmail: string;
      contactName: string;
      contactPhone: string;
      budget: string;
      created: string;
      leadId: string;
      startProgress: string;
      markContacted: string;
      source: string;
      owner: string;
      noOwner: string;
      priority: string;
      firstResponseDue: string;
      nextAction: string;
      lossReason: string;
      lossReasonPlaceholder: string;
      assignment: string;
      deadlines: string;
      saveChanges: string;
      history: string;
      historyEmpty: string;
      historyActorSystem: string;
      comments: string;
      commentsEmpty: string;
      commentPlaceholder: string;
      addComment: string;
      postingComment: string;
      syntheticNotice: string;
    };
    toasts: {
      statusUpdatedTitle: string;
      statusUpdatedDescription: string;
      statusUpdateFailedTitle: string;
      refreshFailedTitle: string;
      leadUpdatedTitle: string;
      leadUpdateFailedTitle: string;
      commentAddedTitle: string;
    };
    status: Record<LeadStatus, string>;
    priority: Record<LeadPriority, string>;
    source: Record<LeadSource, string>;
  };
  errors: {
    api: Record<DemoApiErrorCode, string>;
    login: Record<LoginErrorCode, string>;
  };
  accessibility: {
    loadingLeads: string;
    closePanel: string;
    notifications: string;
    dismissNotification: string;
  };
}
