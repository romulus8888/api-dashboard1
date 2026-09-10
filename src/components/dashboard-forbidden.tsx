import { ShieldAlert } from "lucide-react";

import type { Dictionary } from "@/i18n/dictionaries/types";

interface DashboardForbiddenProps {
  dictionary: Dictionary;
}

export function DashboardForbidden({ dictionary }: DashboardForbiddenProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <ShieldAlert className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-amber-950">{dictionary.auth.forbiddenTitle}</h2>
      <p className="mt-2 max-w-lg text-sm text-amber-900">{dictionary.auth.forbiddenDescription}</p>
    </div>
  );
}
