import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, ClipboardCheck, Zap } from "lucide-react";

import DemoLeadGenerator from "@/components/demo-lead-generator";
import { SiteHeader } from "@/components/site-header";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { notFound } from "next/navigation";

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
    title: dictionary.metadata.homeTitle,
    description: dictionary.metadata.homeDescription,
  };
}

export default async function HomePage({
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

  const features = [
    { icon: Zap, ...dictionary.landing.features.synthetic },
    { icon: ClipboardCheck, ...dictionary.landing.features.claim },
    { icon: Clock3, ...dictionary.landing.features.tracking },
  ];

  return (
    <div className="flex flex-1 flex-col bg-slate-50 text-slate-900">
      <SiteHeader locale={locale} dictionary={dictionary} variant="landing" />

      <main className="flex-1">
        <div
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-center text-sm text-amber-900"
        >
          <strong>{dictionary.prototype.bannerStrong}</strong> {dictionary.prototype.banner}
        </div>

        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-40 h-[28rem] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(99,102,241,0.18),transparent_70%)]"
          />
          <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-16 sm:pt-24">
            <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
              <div className="lg:pt-6">
                <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                  <span className="size-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
                  {dictionary.landing.badge}
                </span>

                <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.1]">
                  {dictionary.landing.title}
                </h1>

                <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
                  {dictionary.landing.description}
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="#submit"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800"
                  >
                    {dictionary.landing.generateCta}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                  <Link
                    href={`/${locale}/dashboard`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    {dictionary.landing.viewDashboardCta}
                  </Link>
                </div>

                <dl className="mt-12 grid gap-6 sm:grid-cols-3">
                  {features.map(({ icon: Icon, title, description }) => (
                    <div key={title}>
                      <dt className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Icon className="size-4 text-indigo-600" aria-hidden="true" />
                        {title}
                      </dt>
                      <dd className="mt-1.5 text-sm leading-6 text-slate-500">{description}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div id="submit" className="scroll-mt-24">
                <DemoLeadGenerator />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {dictionary.common.brand}. {dictionary.common.copyright}
          </p>
          <Link
            href={`/${locale}/dashboard`}
            className="font-medium text-slate-700 hover:text-indigo-600"
          >
            {dictionary.common.adminDashboard}
          </Link>
        </div>
      </footer>
    </div>
  );
}
