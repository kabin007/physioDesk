import { Skeleton } from "@/components/ui/skeleton";

import { Panel } from "./panel";

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="divide-y divide-border">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-6 px-4 py-4">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={column === 0 ? "h-4 w-40" : "h-4 flex-1"}
              style={{ maxWidth: column === 0 ? undefined : 140 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <Panel className="p-5">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="mt-4 h-8 w-20" />
      <Skeleton className="mt-3 h-3 w-32" />
    </Panel>
  );
}

export function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-5">
      <Skeleton className="h-9 w-72" />
      <Panel className="p-6">
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </Panel>
      <Panel className="h-64" />
    </div>
  );
}
