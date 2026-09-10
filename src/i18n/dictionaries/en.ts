import type { Dictionary } from "@/i18n/dictionaries/types";

export const en: Dictionary = {
  locale: "en",
  metadata: {
    siteName: "Northwind Jobs",
    homeTitle: "Northwind Jobs",
    homeDescription:
      "Submit engineering project requests and track them from pending to completed.",
    dashboardTitle: "Dashboard",
    dashboardDescription: "Review, filter, and update the status of incoming job requests.",
    titleTemplate: "%s · Northwind Jobs",
  },
  common: {
    brand: "Northwind Jobs",
    dashboard: "Dashboard",
    backToSite: "Back to site",
    adminDashboard: "Admin dashboard",
    copyright: "All rights reserved.",
    localeSwitcherLabel: "Language",
    localeEn: "EN",
    localeRu: "RU",
  },
  prototype: {
    bannerStrong: "Prototype — not production-ready.",
    banner:
      "The dashboard has no login. Generate only fictional demo leads from predefined presets. n8n automation is local, inactive after import, and not wired to this Vercel deployment.",
  },
  landing: {
    badge: "Now accepting Q3 engagements",
    title: "Ship your backlog without hiring another team.",
    description:
      "Explore a bilingual lead-intake prototype with synthetic personas and projects. Generated identities are fictional and safe for public demos.",
    generateCta: "Generate a demo lead",
    viewDashboardCta: "View the dashboard",
    features: {
      synthetic: {
        title: "Synthetic demo intake",
        description:
          "Server-generated fictional leads are written through a protected API route. Visitors never submit contact data.",
      },
      claim: {
        title: "Atomic claim",
        description:
          "Optional n8n workflow uses a Postgres RPC for single-winner claims and duplicate suppression per idempotency key.",
      },
      tracking: {
        title: "Status tracking",
        description:
          "A simple dashboard lists requests and supports manual status updates. Authentication is not implemented yet.",
      },
    },
  },
  demo: {
    title: "Generate demo lead",
    description:
      "Creates a fictional contact and project from predefined synthetic presets. No visitor names, emails, or project details are stored.",
    note: "All generated identities and projects are fictional demo data for evaluation only.",
    errorTitle: "Could not generate a demo lead.",
    latestLeadTitle: "Latest synthetic lead",
    persona: "Persona",
    project: "Project",
    priority: "Priority",
    locale: "Locale",
    demoLocaleLabel: "Demo locale",
    localeEnglish: "English",
    localeRussian: "Russian",
    verification: "Verification",
    turnstileMissing:
      "Turnstile is not configured for this environment. Generation will only work when server verification is available.",
    verificationRequired: "Complete the verification challenge before generating a demo lead.",
    generating: "Generating…",
    generateButton: "Generate demo lead",
    footerNote: "Synthetic-only demo. The legacy dashboard still reads legacy jobs data in this phase.",
    toastSuccessTitle: "Demo lead generated",
    toastSuccessDescription: "A fictional lead was created from predefined synthetic presets.",
    toastErrorTitle: "Could not generate demo lead",
    retryAfterSeconds: "Try again in {seconds} seconds.",
  },
  dashboard: {
    title: "Job requests",
    subtitle: "Every request submitted through the landing page, with inline status control.",
    showingCount: "Showing {visible} of {total} {unit}",
    showingCountSingular: "request",
    showingCountPlural: "requests",
  },
  jobs: {
    stats: {
      total: "Total jobs",
      pending: "Pending",
      inProgress: "In progress",
      completed: "Completed",
    },
    table: {
      job: "Job",
      client: "Client",
      priority: "Priority",
      budget: "Budget",
      created: "Created",
      status: "Status",
      viewDetails: "View details",
      savingStatus: "Saving status",
      statusFor: "Status for {title}",
    },
    filters: {
      searchPlaceholder: "Search by job title or client email…",
      searchLabel: "Search jobs by title or client email",
      clearSearch: "Clear search",
      allStatuses: "All statuses",
      allPriorities: "All priorities",
      reset: "Reset",
      refresh: "Refresh",
      statusFilter: "Filter by status",
      priorityFilter: "Filter by priority",
    },
    empty: {
      noneTitle: "No requests yet",
      noneDescription: "Requests submitted through the landing page will show up here.",
      filteredTitle: "No requests found",
      filteredDescription:
        "No job requests match your current search and filters. Try a different term or widen the filters.",
      clearFilters: "Clear filters",
    },
    error: {
      title: "Couldn't load job requests",
      tryAgain: "Try again",
      loadFailed: "Unable to load job requests.",
      updateFailed: "Unable to update job status.",
      refreshFailed: "Unable to refresh job requests.",
    },
    detail: {
      submittedBy: "Submitted by {email}",
      close: "Close",
      description: "Description",
      status: "Status",
      saving: "Saving…",
      changesSaveImmediately: "Changes save immediately.",
      details: "Details",
      clientEmail: "Client email",
      budget: "Budget",
      created: "Created",
      requestId: "Request ID",
      startProgress: "Start progress",
      markCompleted: "Mark completed",
    },
    toasts: {
      statusUpdatedTitle: "Status updated",
      statusUpdatedDescription: "“{title}” is now {status}.",
      statusUpdateFailedTitle: "Couldn't update status",
      refreshFailedTitle: "Refresh failed",
    },
    status: {
      pending: "Pending",
      in_progress: "In Progress",
      completed: "Completed",
    },
    priority: {
      low: "Low",
      medium: "Medium",
      high: "High",
    },
  },
  errors: {
    api: {
      demo_not_configured: "Demo lead generation is not configured.",
      rate_limited: "Too many demo lead requests. Please try again later.",
      invalid_payload: "Invalid request payload.",
      turnstile_failed: "Turnstile verification failed.",
      body_too_large: "Request body exceeds the 1 KB limit.",
      invalid_json: "Request body must be valid JSON.",
      generation_failed: "Unable to generate demo lead.",
      verification_required: "Complete the verification challenge before generating a demo lead.",
    },
  },
  accessibility: {
    loadingJobRequests: "Loading job requests…",
    closePanel: "Close panel",
    notifications: "Notifications",
    dismissNotification: "Dismiss notification",
  },
};
