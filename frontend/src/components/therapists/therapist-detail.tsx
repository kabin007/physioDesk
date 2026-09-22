"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";

import { ErrorState } from "@/components/shared/error-state";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageHeader } from "@/components/shared/page-header";
import { Panel, PanelHeader } from "@/components/shared/panel";
import { ProfileSkeleton } from "@/components/shared/skeletons";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { getTherapist } from "@/lib/api/therapists";
import { usePermissions } from "@/lib/auth/session";
import { formatTimeRange } from "@/lib/format";
import { THERAPIST_STATUS, WEEKDAYS } from "@/lib/labels";
import { queryKeys } from "@/lib/query/keys";
import type { Therapist } from "@/types/api";

import { OverridesPanel } from "./overrides-panel";
import { TherapistActions } from "./therapist-actions";
import { TherapistFormDialog } from "./therapist-form-dialog";

export function TherapistDetail({ therapistId }: { therapistId: string }) {
  const router = useRouter();
  const { manageTherapists } = usePermissions();
  const [editing, setEditing] = useState(false);
  const { data: therapist, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.therapists.detail(therapistId),
    queryFn: () => getTherapist(therapistId),
  });

  if (error instanceof ApiError && (error.status === 404 || error.status === 422)) {
    return (
      <NotFoundState
        title="Therapist not found"
        description="This therapist doesn't exist or has been deleted."
        backHref="/therapists"
        backLabel="Back to therapists"
      />
    );
  }
  if (error) {
    return (
      <Panel>
        <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load this therapist" />
      </Panel>
    );
  }
  if (isPending) return <ProfileSkeleton />;

  return (
    <>
      <PageHeader
        back={{ href: "/therapists", label: "Therapists" }}
        title={therapist.name}
        meta={<StatusBadge meta={THERAPIST_STATUS[therapist.is_active ? "ACTIVE" : "INACTIVE"]} />}
        description={therapist.specialty}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href={`/schedule?therapist=${therapist.id}`}>
                <CalendarDays aria-hidden />
                View schedule
              </Link>
            </Button>
            {manageTherapists && (
              <>
                <Button onClick={() => setEditing(true)}>
                  <Pencil aria-hidden />
                  Edit
                </Button>
                <TherapistActions therapist={therapist} trigger="button" onDeleted={() => router.replace("/therapists")} />
              </>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <WeeklySchedule therapist={therapist} />
        <OverridesPanel therapist={therapist} canManage={manageTherapists} />
      </div>

      {manageTherapists && <TherapistFormDialog open={editing} onOpenChange={setEditing} therapist={therapist} />}
    </>
  );
}

function WeeklySchedule({ therapist }: { therapist: Therapist }) {
  return (
    <Panel className="h-fit overflow-hidden">
      <PanelHeader
        title="Weekly schedule"
        description={
          <>
            <span className="font-mono">{therapist.slot_duration_minutes}</span>-minute slots ·{" "}
            <span className="font-mono">{therapist.weekly_hours}</span> hours per week
          </>
        }
      />
      <ul className="divide-y divide-border">
        {WEEKDAYS.map((day) => {
          const works = therapist.working_days.includes(day.value);
          return (
            <li key={day.value} className="flex items-center justify-between px-5 py-3 text-sm">
              <span className={cn("font-medium", !works && "text-muted-foreground")}>{day.long}</span>
              {works ? (
                <span className="font-mono text-[13px]">{formatTimeRange(therapist.start_time, therapist.end_time)}</span>
              ) : (
                <span className="text-[13px] text-muted-foreground">Not working</span>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
