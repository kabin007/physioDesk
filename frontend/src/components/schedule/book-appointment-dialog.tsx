"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { DatePicker } from "@/components/shared/date-picker";
import { fieldAria, FormField } from "@/components/shared/form-field";
import { InlineAlert } from "@/components/shared/inline-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useInvalidateAppointments } from "@/hooks/use-invalidate-appointments";
import { createAppointment } from "@/lib/api/appointments";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { clinicToday, formatShortDate } from "@/lib/format";
import { applyServerFieldErrors } from "@/lib/forms";
import { enumOptions, PAYMENT_METHOD_LABEL, SESSION_TYPE_LABEL } from "@/lib/labels";
import { queryKeys } from "@/lib/query/keys";
import {
  BOOKING_CONFLICT_MESSAGES,
  bookingSchema,
  type BookingValues,
} from "@/lib/validations/appointment";
import type { PatientSummary } from "@/types/api";

import { PatientCombobox } from "./patient-combobox";
import { SlotPicker } from "./slot-picker";
import { TherapistSelect } from "./therapist-select";

export interface BookingPrefill {
  patient?: PatientSummary;
  therapistId?: string;
  date?: string;
  startTime?: string;
}

interface BookAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: BookingPrefill;
}

export function BookAppointmentDialog({ open, onOpenChange, initial }: BookAppointmentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <BookingForm initial={initial} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function BookingForm({ initial, onDone }: { initial?: BookingPrefill; onDone: () => void }) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAppointments();
  const [patient, setPatient] = useState<PatientSummary | null>(initial?.patient ?? null);
  const [problem, setProblem] = useState<string | null>(null);

  const form = useForm<BookingValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      patient_id: initial?.patient?.id ?? "",
      therapist_id: initial?.therapistId ?? "",
      appointment_date: initial?.date ?? clinicToday(),
      start_time: initial?.startTime ?? "",
      session_type: "TREATMENT",
      notes: "",
    },
  });
  const { errors } = form.formState;
  const [therapistId, date] = useWatch({ control: form.control, name: ["therapist_id", "appointment_date"] });

  const book = useMutation({
    mutationFn: (values: BookingValues) =>
      createAppointment({ ...values, notes: values.notes || null }),
    onSuccess: (appointment) => {
      invalidate();
      toast.success("Appointment booked", {
        description: `${appointment.patient.full_name} · ${formatShortDate(appointment.appointment_date)} at ${appointment.start_time}`,
      });
      onDone();
    },
    onError: (error, values) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 400)) {
        // Availability changed since it was loaded: refresh it, keep everything else.
        queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
        form.setValue("start_time", "");
        setProblem(BOOKING_CONFLICT_MESSAGES[error.code] ?? error.message);
        form.setFocus("start_time");
        return;
      }
      if (!applyServerFieldErrors(error, form.setError, Object.keys(values))) {
        toast.error(errorMessage(error));
      }
    },
  });

  const resetTime = () => form.setValue("start_time", "");

  return (
    <>
      <DialogHeader>
        <DialogTitle>Book appointment</DialogTitle>
        <DialogDescription>Only times the therapist actually has free can be chosen.</DialogDescription>
      </DialogHeader>

      <form
        id="booking-form"
        noValidate
        className="space-y-5"
        onSubmit={form.handleSubmit((values) => {
          setProblem(null);
          book.mutate(values);
        })}
      >
        {problem && (
          <InlineAlert title="Slot no longer available" tone="warning">
            {problem}
          </InlineAlert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="patient" label="Patient" error={errors.patient_id?.message}>
            <PatientCombobox
              id="patient"
              value={patient}
              invalid={Boolean(errors.patient_id)}
              onChange={(selected) => {
                setPatient(selected);
                form.setValue("patient_id", selected.id, { shouldValidate: true });
              }}
            />
          </FormField>
          <FormField id="therapist" label="Therapist" error={errors.therapist_id?.message}>
            <Controller
              control={form.control}
              name="therapist_id"
              render={({ field }) => (
                <TherapistSelect
                  id="therapist"
                  value={field.value || undefined}
                  invalid={Boolean(errors.therapist_id)}
                  onChange={(value) => {
                    field.onChange(value);
                    resetTime();
                  }}
                />
              )}
            />
          </FormField>
          <FormField id="appointment_date" label="Date" error={errors.appointment_date?.message}>
            <Controller
              control={form.control}
              name="appointment_date"
              render={({ field }) => (
                <DatePicker
                  id="appointment_date"
                  value={field.value}
                  min={clinicToday()}
                  onChange={(value) => {
                    field.onChange(value);
                    resetTime();
                  }}
                />
              )}
            />
          </FormField>
          <FormField id="payment_method" label="Payment method" error={errors.payment_method?.message}>
            <Controller
              control={form.control}
              name="payment_method"
              render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger {...fieldAria("payment_method", errors.payment_method?.message)} className="w-full">
                    <SelectValue placeholder="How will they pay?" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {enumOptions(PAYMENT_METHOD_LABEL).map((option) => (
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

        <FormField id="start_time" label="Time" error={errors.start_time?.message}>
          <Controller
            control={form.control}
            name="start_time"
            render={({ field }) => (
              <div ref={field.ref} tabIndex={-1} className="outline-none">
                <SlotPicker
                  therapistId={therapistId || undefined}
                  date={date || undefined}
                  value={field.value}
                  invalid={Boolean(errors.start_time)}
                  onChange={(value) => {
                    setProblem(null);
                    field.onChange(value);
                  }}
                />
              </div>
            )}
          />
        </FormField>

        <FormField id="session_type" label="Session type">
          <Controller
            control={form.control}
            name="session_type"
            render={({ field }) => (
              <ToggleGroup
                id="session_type"
                type="single"
                variant="outline"
                value={field.value}
                onValueChange={(value) => value && field.onChange(value)}
                className="w-full sm:w-auto"
              >
                {enumOptions(SESSION_TYPE_LABEL).map((option) => (
                  <ToggleGroupItem key={option.value} value={option.value} className="flex-1 px-4 sm:flex-none">
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
        </FormField>

        <FormField id="notes" label="Notes" optional error={errors.notes?.message}>
          <Textarea
            {...fieldAria("notes", errors.notes?.message)}
            rows={3}
            placeholder="Anything the therapist should know"
            {...form.register("notes")}
          />
        </FormField>
      </form>

      <DialogFooter>
        <Button variant="secondary" onClick={onDone} disabled={book.isPending}>
          Cancel
        </Button>
        <Button type="submit" form="booking-form" disabled={book.isPending}>
          {book.isPending ? "Booking…" : "Book appointment"}
        </Button>
      </DialogFooter>
    </>
  );
}
