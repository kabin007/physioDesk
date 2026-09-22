"use client";

import { ErrorState } from "@/components/shared/error-state";
import { Panel } from "@/components/shared/panel";

/** Last-resort boundary for unexpected render errors inside the app shell. */
export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Panel className="mt-6">
      <ErrorState error={error} onRetry={reset} title="Something went wrong on this page" />
    </Panel>
  );
}
