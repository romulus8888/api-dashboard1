import { randomInt } from "node:crypto";

import type { LeadInsert, LeadLocale, LeadPriority } from "@/types/lead";

interface SyntheticPersona {
  label: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  company: string;
}

interface SyntheticProject {
  title: string;
  description: string;
  budgetAmount: number;
  priority: LeadPriority;
}

const PERSONAS: Record<LeadLocale, SyntheticPersona[]> = {
  en: [
    {
      label: "Alex Rivera",
      contactName: "Alex Rivera",
      contactEmail: "alex.rivera@example.demo",
      contactPhone: "+1-555-0101",
      company: "Fictional Labs",
    },
    {
      label: "Morgan Chen",
      contactName: "Morgan Chen",
      contactEmail: "morgan.chen@example.demo",
      contactPhone: "+1-555-0102",
      company: "Demo Ventures",
    },
    {
      label: "Jordan Blake",
      contactName: "Jordan Blake",
      contactEmail: "jordan.blake@example.demo",
      contactPhone: "+1-555-0103",
      company: "Sample Systems",
    },
  ],
  ru: [
    {
      label: "Иван Демо",
      contactName: "Иван Демо",
      contactEmail: "ivan.demo@example.demo",
      contactPhone: "+7-495-555-0101",
      company: "Демо Лаб",
    },
    {
      label: "Анна Пример",
      contactName: "Анна Пример",
      contactEmail: "anna.primer@example.demo",
      contactPhone: "+7-495-555-0102",
      company: "Тест Проекты",
    },
    {
      label: "Сергей Образец",
      contactName: "Сергей Образец",
      contactEmail: "sergey.obrazec@example.demo",
      contactPhone: "+7-495-555-0103",
      company: "Выдуманные Решения",
    },
  ],
};

const PROJECTS: Record<LeadLocale, SyntheticProject[]> = {
  en: [
    {
      title: "Migrate billing API to v2",
      description:
        "Fictional scope: replace legacy billing endpoints, add idempotent webhooks, and ship a staged rollout playbook.",
      budgetAmount: 12000,
      priority: "medium",
    },
    {
      title: "Launch partner onboarding portal",
      description:
        "Fictional scope: self-serve partner signup, document collection, and automated sandbox provisioning.",
      budgetAmount: 18500,
      priority: "high",
    },
    {
      title: "Consolidate analytics dashboards",
      description:
        "Fictional scope: unify product metrics into one executive view with exportable weekly summaries.",
      budgetAmount: 9000,
      priority: "low",
    },
  ],
  ru: [
    {
      title: "Миграция API биллинга на v2",
      description:
        "Вымышленный объём: заменить устаревшие эндпоинты, добавить идемпотентные вебхуки и поэтапный план выката.",
      budgetAmount: 12000,
      priority: "medium",
    },
    {
      title: "Портал подключения партнёров",
      description:
        "Вымышленный объём: самообслуживаемая регистрация, сбор документов и автоматическое создание песочницы.",
      budgetAmount: 18500,
      priority: "high",
    },
    {
      title: "Объединение аналитических дашбордов",
      description:
        "Вымышленный объём: собрать продуктовые метрики в единый обзор с еженедельными выгрузками.",
      budgetAmount: 9000,
      priority: "low",
    },
  ],
};

function pickRandom<T>(items: readonly T[]): T {
  return items[randomInt(items.length)];
}

export interface SyntheticLeadDraft {
  insert: LeadInsert;
  personaLabel: string;
  demoResetGroupId: string;
}

export function buildSyntheticLeadDraft(
  locale: LeadLocale,
  demoResetGroupId: string,
): SyntheticLeadDraft {
  const persona = pickRandom(PERSONAS[locale]);
  const project = pickRandom(PROJECTS[locale]);

  return {
    personaLabel: persona.label,
    demoResetGroupId,
    insert: {
      source: "demo_seed",
      locale,
      contact_name: persona.contactName,
      contact_email: persona.contactEmail,
      contact_phone: persona.contactPhone,
      title: project.title,
      description: project.description,
      budget_amount: project.budgetAmount,
      budget_currency: "USD",
      priority: project.priority,
      is_synthetic: true,
      demo_reset_group_id: demoResetGroupId,
      status: "new",
    },
  };
}
