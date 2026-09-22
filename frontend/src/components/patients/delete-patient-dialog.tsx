"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { deletePatient } from "@/lib/api/patients";
import { queryKeys } from "@/lib/query/keys";
import type { Patient, PatientDetail } from "@/types/api";

interface DeletePatientDialogProps {
  patient: Patient | PatientDetail | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

/**
 * The API only deletes patients without appointments or invoices (409 otherwise), so that
 * clinical and billing history is never lost. The 409 is explained, not just reported.
 */
export function DeletePatientDialog({
  patient,
  onOpenChange,
  onDeleted,
}: DeletePatientDialogProps) {
  const queryClient = useQueryClient();
  const [blocked, setBlocked] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => deletePatient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      toast.success("Patient deleted", { description: patient?.full_name });
      close();
      onDeleted?.();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) setBlocked(error.message);
      else toast.error(errorMessage(error));
    },
  });

  function close() {
    setBlocked(null);
    onOpenChange(false);
  }

  if (!patient) return null;
  return blocked ? (
    <ConfirmDialog
      open
      onOpenChange={close}
      title="This patient can't be deleted"
      description={
        <>
          <p>{blocked}</p>
          <p className="mt-2">
            Their session and billing history must be kept. Set the patient&apos;s status to{" "}
            <strong className="font-medium text-foreground">Completed</strong> or{" "}
            <strong className="font-medium text-foreground">On hold</strong> instead.
          </p>
        </>
      }
      confirmLabel="Got it"
      cancelLabel="Close"
      onConfirm={close}
    />
  ) : (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && close()}
      title="Delete this patient?"
      description={
        <>
          <strong className="font-medium text-foreground">{patient.full_name}</strong> will be
          permanently removed. This is only possible for patients with no appointments or invoices.
        </>
      }
      confirmLabel="Delete patient"
      destructive
      pending={remove.isPending}
      onConfirm={() => remove.mutate(patient.id)}
    />
  );
}
