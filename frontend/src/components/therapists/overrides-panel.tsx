"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarRange, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Panel, PanelHeader } from "@/components/shared/panel";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { deleteOverride, listOverrides } from "@/lib/api/therapists";
import { clinicToday, formatLongDate, formatTimeRange } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";
import { SCHEDULE_CONFLICT_TITLE } from "@/lib/validations/therapist";
import type { ScheduleOverride, Therapist } from "@/types/api";

import { OverrideDialog } from "./override-dialog";
import { useInvalidateTherapists } from "./use-invalidate-therapists";

export function OverridesPanel({ therapist, canManage }: { therapist: Therapist; canManage: boolean }) {
  const invalidate = useInvalidateTherapists();
  const [dialog, setDialog] = useState<{ override?: ScheduleOverride } | null>(null);
  const [removing, setRemoving] = useState<ScheduleOverride | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const today = clinicToday();

  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.therapists.overrides(therapist.id),
    queryFn: () => listOverrides(therapist.id),
  });
  const upcoming = data?.filter((o) => o.date >= today) ?? [];
  const past = data?.filter((o) => o.date < today) ?? [];

  const remove = useMutation({
    mutationFn: (override: ScheduleOverride) => deleteOverride(therapist.id, override.id),
    onSuccess: () => {
      invalidate();
      setRemoving(null);
      toast.success("Schedule override removed");
    },
    onError: (err) => {
      setRemoving(null);
      if (err instanceof ApiError && err.status === 409) setBlocked(err.message);
      else toast.error(errorMessage(err));
    },
  });

  return (
    <Panel className="h-fit overflow-hidden">
      <PanelHeader
        title="Schedule overrides"
        description="Date-specific days off or custom hours. They take precedence over the weekly schedule."
        action={
          canManage && (
            <Button size="sm" onClick={() => setDialog({})}>
              <Plus aria-hidden />
              Add override
            </Button>
          )
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <TableSkeleton rows={2} columns={3} />
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No upcoming overrides"
          description={`${therapist.name} follows the regular weekly schedule.`}
        />
      ) : (
        <ul className="divide-y divide-border">
          {upcoming.map((override) => (
            <OverrideRow
              key={override.id}
              override={override}
              canManage={canManage}
              onEdit={() => setDialog({ override })}
              onRemove={() => setRemoving(override)}
            />
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <p className="border-t border-border bg-[#faf8f2] px-5 py-2.5 text-xs text-muted-foreground">
          {past.length} past override{past.length === 1 ? "" : "s"} kept as history.
        </p>
      )}

      {canManage && (
        <>
          <OverrideDialog
            therapist={therapist}
            open={Boolean(dialog)}
            onOpenChange={(open) => !open && setDialog(null)}
            override={dialog?.override}
          />
          <ConfirmDialog
            open={Boolean(removing)}
            onOpenChange={(open) => !open && setRemoving(null)}
            title="Remove this schedule override?"
            description={
              removing &&
              `${therapist.name} will follow the regular weekly schedule on ${formatLongDate(removing.date)}.`
            }
            confirmLabel="Remove override"
            cancelLabel="Keep it"
            destructive
            pending={remove.isPending}
            onConfirm={() => removing && remove.mutate(removing)}
          />
          <ConfirmDialog
            open={Boolean(blocked)}
            onOpenChange={(open) => !open && setBlocked(null)}
            title={SCHEDULE_CONFLICT_TITLE}
            description={
              <>
                <p>{blocked}</p>
                <p className="mt-2">Reschedule or cancel those appointments first, then try again.</p>
              </>
            }
            confirmLabel="Got it"
            cancelLabel="Close"
            onConfirm={() => setBlocked(null)}
          />
        </>
      )}
    </Panel>
  );
}

function OverrideRow({
  override,
  canManage,
  onEdit,
  onRemove,
}: {
  override: ScheduleOverride;
  canManage: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
      <div className="min-w-56">
        <p className="text-sm font-medium">{formatLongDate(override.date)}</p>
        {override.note && <p className="text-[12.5px] text-muted-foreground">{override.note}</p>}
      </div>
      {override.is_day_off ? (
        <span className="rounded-full bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border">
          Day off
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-ink">Custom hours</span>
          <span className="font-mono text-[13px]">
            {override.start_time && override.end_time && formatTimeRange(override.start_time, override.end_time)}
          </span>
        </span>
      )}
      {canManage && (
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Edit override" onClick={onEdit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Remove override" onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}
