import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LoginForm } from "@/components/login-form";
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
    title: dictionary.metadata.loginTitle,
    description: dictionary.metadata.loginDescription,
  };
}

export default async function LoginPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}>) {
  const { lang } = await params;
  const query = await searchParams;

  if (!isLocale(lang)) {
    notFound();
  }

  const locale: Locale = lang;
  const dictionary = getDictionary(locale);

  return (
    <div className="flex flex-1 flex-col bg-slate-50 text-slate-900">
      <SiteHeader locale={locale} dictionary={dictionary} variant="landing" />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {dictionary.metadata.loginTitle}
            </h1>
            <p className="mt-2 text-sm text-slate-500">{dictionary.metadata.loginDescription}</p>
          </div>

          <LoginForm returnTo={query.returnTo} />

          <p className="mt-6 text-center text-sm text-slate-500">
            <Link href={`/${locale}`} className="font-medium text-indigo-600 hover:text-indigo-500">
              {dictionary.common.backToSite}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
