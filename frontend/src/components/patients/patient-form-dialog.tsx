"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { fieldAria, FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTherapists } from "@/hooks/use-therapists";
import { createPatient, updatePatient } from "@/lib/api/patients";
import { errorMessage } from "@/lib/api/errors";
import { applyServerFieldErrors } from "@/lib/forms";
import { enumOptions, GENDER_LABEL, PATIENT_STATUS, statusOptions } from "@/lib/labels";
import { queryKeys } from "@/lib/query/keys";
import {
  patientDefaults,
  patientSchema,
  toPatientPayload,
  UNASSIGNED,
  type PatientFormValues,
} from "@/lib/validations/patient";
import type { Patient, PatientDetail } from "@/types/api";

const FIELDS = Object.keys(patientSchema.shape);

interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this patient; omit to create a new one. */
  patient?: Patient | PatientDetail;
  onSaved?: (patient: Patient) => void;
}

export function PatientFormDialog(props: PatientFormDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        {/* Content unmounts when closed, so the form starts fresh on every open. */}
        <PatientForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function PatientForm({ onOpenChange, patient, onSaved }: PatientFormDialogProps) {
  const queryClient = useQueryClient();
  const { data: therapists = [] } = useTherapists();
  const isEdit = Boolean(patient);

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: patientDefaults(patient),
  });
  const { errors } = form.formState;

  const save = useMutation({
    mutationFn: (values: PatientFormValues) => {
      const payload = toPatientPayload(values);
      return patient ? updatePatient(patient.id, payload) : createPatient(payload);
    },
    onSuccess: (saved) => {
      // Patient names appear in lists, profiles, the schedule grid and invoices.
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      if (isEdit) {
        queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      }
      toast.success(isEdit ? "Patient updated" : "Patient added", { description: saved.full_name });
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error) => {
      if (!applyServerFieldErrors(error, form.setError, FIELDS)) toast.error(errorMessage(error));
    },
  });

  // Inactive therapists can't take new patients, but keep a current assignment visible.
  const therapistOptions = therapists.filter(
    (t) => t.is_active || t.id === patient?.assigned_therapist_id,
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit patient" : "Add patient"}</DialogTitle>
        <DialogDescription>
          {isEdit ? "Update the patient's details." : "Register a new patient with the clinic."}
        </DialogDescription>
      </DialogHeader>

      <form
        id="patient-form"
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        className="space-y-6"
      >
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            Personal details
          </legend>
          <FormField
            id="full_name"
            label="Full name"
            error={errors.full_name?.message}
            className="sm:col-span-2"
          >
            <Input
              {...fieldAria("full_name", errors.full_name?.message)}
              {...form.register("full_name")}
            />
          </FormField>
          <FormField id="phone" label="Phone" error={errors.phone?.message}>
            <Input
              {...fieldAria("phone", errors.phone?.message)}
              type="tel"
              placeholder="+977 98XXXXXXXX"
              {...form.register("phone")}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="age" label="Age" error={errors.age?.message}>
              <Input
                {...fieldAria("age", errors.age?.message)}
                type="number"
                inputMode="numeric"
                min={1}
                max={130}
                {...form.register("age", { valueAsNumber: true })}
              />
            </FormField>
            <FormField id="gender" label="Gender" error={errors.gender?.message}>
              <Controller
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger
                      {...fieldAria("gender", errors.gender?.message)}
                      className="w-full"
                    >
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {enumOptions(GENDER_LABEL).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          </div>
          <FormField
            id="address"
            label="Address"
            optional
            error={errors.address?.message}
            className="sm:col-span-2"
          >
            <Input
              {...fieldAria("address", errors.address?.message)}
              {...form.register("address")}
            />
          </FormField>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            Treatment
          </legend>
          <FormField
            id="condition"
            label="Condition"
            error={errors.condition?.message}
            className="sm:col-span-2"
          >
            <Input
              {...fieldAria("condition", errors.condition?.message)}
              placeholder="e.g. Lower back pain"
              {...form.register("condition")}
            />
          </FormField>
          <FormField
            id="assigned_therapist_id"
            label="Assigned therapist"
            error={errors.assigned_therapist_id?.message}
          >
            <Controller
              control={form.control}
              name="assigned_therapist_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger {...fieldAria("assigned_therapist_id")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {therapistOptions.map((therapist) => (
                      <SelectItem key={therapist.id} value={therapist.id}>
                        {therapist.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField id="status" label="Status" error={errors.status?.message}>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger {...fieldAria("status")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {statusOptions(PATIENT_STATUS).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField
            id="package"
            label="Package"
            optional
            error={errors.package?.message}
            className="sm:col-span-2"
          >
            <Input
              {...fieldAria("package", errors.package?.message)}
              placeholder="e.g. 10-session rehab package"
              {...form.register("package")}
            />
          </FormField>
        </fieldset>
      </form>

      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" form="patient-form" disabled={save.isPending}>
          {save.isPending ? "Saving…" : isEdit ? "Save changes" : "Add patient"}
        </Button>
      </DialogFooter>
    </>
  );
}
