import type { Metadata } from "next";
import { Suspense } from "react";

import { ScheduleView } from "@/components/schedule/schedule-view";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage() {
  return (
    <Suspense>
      <ScheduleView />
    </Suspense>
  );
}
