"use client";

import { Plus, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { ReadOnlyBadge } from "@/components/shared/read-only-badge";
import { Panel } from "@/components/shared/panel";
import { TableSkeleton } from "@/components/shared/skeletons";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTherapists } from "@/hooks/use-therapists";
import { usePermissions } from "@/lib/auth/session";
import { formatTimeRange } from "@/lib/format";
import { THERAPIST_STATUS } from "@/lib/labels";

import { TherapistActions } from "./therapist-actions";
import { TherapistFormDialog } from "./therapist-form-dialog";
import { WorkingDays } from "./working-days";

export function TherapistsView() {
  const router = useRouter();
  const { manageTherapists, readOnlyAdminAreas } = usePermissions();
  const [creating, setCreating] = useState(false);
  const { data, error, isPending, refetch } = useTherapists();

  return (
    <>
      <PageHeader
        title="Therapists"
        description="The clinic roster and weekly schedules."
        meta={readOnlyAdminAreas && <ReadOnlyBadge />}
        actions={
          manageTherapists && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Add therapist
            </Button>
          )
        }
      />

      <Panel className="overflow-hidden">
        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load therapists" />
        ) : isPending ? (
          <TableSkeleton columns={7} rows={4} />
        ) : data.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No therapists yet"
            description="Add a therapist to start taking bookings."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Therapist</TableHead>
                  <TableHead>Working days</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead className="text-right">Slot</TableHead>
                  <TableHead className="text-right">Weekly hours</TableHead>
                  <TableHead className="text-right">Seen today</TableHead>
                  <TableHead>Status</TableHead>
                  {manageTherapists && (
                    <TableHead className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((therapist) => (
                  <TableRow
                    key={therapist.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/therapists/${therapist.id}`)}
                  >
                    <TableCell>
                      <Link
                        href={`/therapists/${therapist.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {therapist.name}
                      </Link>
                      <span className="block text-[12.5px] text-muted-foreground">
                        {therapist.specialty}
                      </span>
                    </TableCell>
                    <TableCell>
                      <WorkingDays days={therapist.working_days} />
                    </TableCell>
                    <TableCell className="font-mono text-[13px]">
                      {formatTimeRange(therapist.start_time, therapist.end_time)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[13px]">
                      {therapist.slot_duration_minutes} min
                    </TableCell>
                    <TableCell className="text-right font-mono text-[13px]">
                      {therapist.weekly_hours}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[13px]">
                      {therapist.patients_seen_today}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        meta={THERAPIST_STATUS[therapist.is_active ? "ACTIVE" : "INACTIVE"]}
                      />
                    </TableCell>
                    {manageTherapists && (
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <TherapistActions therapist={therapist} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      {manageTherapists && <TherapistFormDialog open={creating} onOpenChange={setCreating} />}
    </>
  );
}
