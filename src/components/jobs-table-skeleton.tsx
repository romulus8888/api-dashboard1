import { Skeleton } from "@/components/ui/skeleton";

const ROW_COUNT = 6;

export interface JobsTableSkeletonProps {
  loadingLabel: string;
}

export function JobsTableSkeleton({ loadingLabel }: JobsTableSkeletonProps) {
  return (
    <div className="divide-y divide-slate-100" aria-busy="true" aria-live="polite">
      <span className="sr-only">{loadingLabel}</span>
      {Array.from({ length: ROW_COUNT }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3 bg-slate-100" />
          </div>
          <Skeleton className="hidden h-3.5 w-44 bg-slate-100 sm:block" />
          <Skeleton className="h-5 w-16 rounded-full bg-slate-100" />
          <Skeleton className="hidden h-3.5 w-16 bg-slate-100 md:block" />
          <Skeleton className="hidden h-3.5 w-20 bg-slate-100 md:block" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      ))}
    </div>
  );
}
