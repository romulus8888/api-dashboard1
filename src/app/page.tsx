import Link from "next/link";
import { ArrowRight, Clock3, ClipboardCheck, LayoutDashboard, Sparkles, Zap } from "lucide-react";

import DemoLeadGenerator from "@/components/demo-lead-generator";

const FEATURES = [
  {
    icon: Zap,
    title: "Synthetic demo intake",
    description:
      "Server-generated fictional leads are written through a protected API route. Visitors never submit contact data.",
  },
  {
    icon: ClipboardCheck,
    title: "Atomic claim",
    description:
      "Optional n8n workflow uses a Postgres RPC for single-winner claims and duplicate suppression per idempotency key.",
  },
  {
    icon: Clock3,
    title: "Status tracking",
    description:
      "A simple dashboard lists requests and supports manual status updates. Authentication is not implemented yet.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/30">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold tracking-tight">Northwind Jobs</span>
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <LayoutDashboard className="size-4" aria-hidden="true" />
            Dashboard
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-center text-sm text-amber-900"
        >
          <strong>Prototype — not production-ready.</strong> The dashboard has no login. Generate
          only fictional demo leads from predefined presets. n8n automation is local, inactive
          after import, and not wired to this Vercel deployment.
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
                  Now accepting Q3 engagements
                </span>

                <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.1]">
                  Ship your backlog without hiring another team.
                </h1>

                <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
                  Explore a bilingual lead-intake prototype with synthetic personas and projects.
                  Generated identities are fictional and safe for public demos.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="#submit"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800"
                  >
                    Generate a demo lead
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    View the dashboard
                  </Link>
                </div>

                <dl className="mt-12 grid gap-6 sm:grid-cols-3">
                  {FEATURES.map(({ icon: Icon, title, description }) => (
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
          <p>&copy; {new Date().getFullYear()} Northwind Jobs. All rights reserved.</p>
          <Link href="/dashboard" className="font-medium text-slate-700 hover:text-indigo-600">
            Admin dashboard
          </Link>
        </div>
      </footer>
    </div>
  );
}
