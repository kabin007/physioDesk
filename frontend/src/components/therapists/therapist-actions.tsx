"use client";

import { useMutation } from "@tanstack/react-query";
import { MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { deleteTherapist, updateTherapist } from "@/lib/api/therapists";
import { SCHEDULE_CONFLICT_TITLE } from "@/lib/validations/therapist";
import type { Therapist } from "@/types/api";

import { TherapistFormDialog } from "./therapist-form-dialog";
import { useInvalidateTherapists } from "./use-invalidate-therapists";

type Pending = "deactivate" | "delete" | null;

/** Admin-only actions for one therapist: edit, (de)activate, delete. */
export function TherapistActions({
  therapist,
  onDeleted,
  trigger = "icon",
}: {
  therapist: Therapist;
  onDeleted?: () => void;
  trigger?: "icon" | "button";
}) {
  const invalidate = useInvalidateTherapists();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<Pending>(null);
  const [blocked, setBlocked] = useState<{ title: string; message: string } | null>(null);

  const onConflict = (error: unknown, title: string) => {
    setConfirming(null);
    if (error instanceof ApiError && error.status === 409)
      setBlocked({ title, message: error.message });
    else toast.error(errorMessage(error));
  };

  const toggleActive = useMutation({
    mutationFn: () => updateTherapist(therapist.id, { is_active: !therapist.is_active }),
    onSuccess: (saved) => {
      invalidate();
      setConfirming(null);
      toast.success(saved.is_active ? "Therapist reactivated" : "Therapist deactivated", {
        description: saved.name,
      });
    },
    onError: (error) => onConflict(error, SCHEDULE_CONFLICT_TITLE),
  });
  const remove = useMutation({
    mutationFn: () => deleteTherapist(therapist.id),
    onSuccess: () => {
      invalidate();
      setConfirming(null);
      toast.success("Therapist deleted", { description: therapist.name });
      onDeleted?.();
    },
    onError: (error) => onConflict(error, "This therapist can't be deleted"),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger === "icon" ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${therapist.name}`}>
              <MoreHorizontal />
            </Button>
          ) : (
            <Button variant="secondary" size="icon" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {trigger === "icon" && (
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit therapist
            </DropdownMenuItem>
          )}
          {therapist.is_active ? (
            <DropdownMenuItem onSelect={() => setConfirming("deactivate")}>
              <Pause aria-hidden />
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => toggleActive.mutate()}>
              <Play aria-hidden />
              Reactivate
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming("delete")}>
            <Trash2 aria-hidden />
            Delete therapist
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TherapistFormDialog open={editing} onOpenChange={setEditing} therapist={therapist} />
      <ConfirmDialog
        open={confirming === "deactivate"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Deactivate ${therapist.name}?`}
        description="They will no longer appear on the schedule or accept bookings. Their history is kept, and you can reactivate them at any time."
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        pending={toggleActive.isPending}
        onConfirm={() => toggleActive.mutate()}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Delete this therapist?"
        description="Only therapists without any appointments can be deleted. Their patients become unassigned and their schedule overrides are removed."
        confirmLabel="Delete therapist"
        cancelLabel="Cancel"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      <ConfirmDialog
        open={Boolean(blocked)}
        onOpenChange={(open) => !open && setBlocked(null)}
        title={blocked?.title ?? ""}
        description={
          <>
            <p>{blocked?.message}</p>
            <p className="mt-2">
              To stop bookings for a therapist with history, deactivate them. Upcoming appointments
              must be rescheduled or cancelled first.
            </p>
          </>
        }
        confirmLabel="Got it"
        cancelLabel="Close"
        onConfirm={() => setBlocked(null)}
      />
    </>
  );
}
