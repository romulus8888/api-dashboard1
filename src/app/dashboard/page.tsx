import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

import JobsDashboard from "@/components/jobs-dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Review, filter, and update the status of incoming job requests.",
};

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/30">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold tracking-tight">Northwind Jobs</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Job requests</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every request submitted through the landing page, with inline status control.
          </p>
        </div>

        <JobsDashboard />
      </main>
    </div>
  );
}
