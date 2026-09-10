import type { Metadata } from "next";
import { notFound } from "next/navigation";

import JobsDashboard from "@/components/jobs-dashboard";
import { SiteHeader } from "@/components/site-header";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ lang: string }>;
}>): Promise<Metadata> {
  const { lang } = await params;

  if (!isLocale(lang)) {
    return {};
  }

  const dictionary = getDictionary(lang);

  return {
    title: dictionary.metadata.dashboardTitle,
    description: dictionary.metadata.dashboardDescription,
  };
}

export default async function DashboardPage({
  params,
}: Readonly<{
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;

  if (!isLocale(lang)) {
    notFound();
  }

  const locale: Locale = lang;
  const dictionary = getDictionary(locale);

  return (
    <div className="flex flex-1 flex-col bg-slate-50 text-slate-900">
      <SiteHeader locale={locale} dictionary={dictionary} variant="dashboard" />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {dictionary.dashboard.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{dictionary.dashboard.subtitle}</p>
        </div>

        <JobsDashboard />
      </main>
    </div>
  );
}
