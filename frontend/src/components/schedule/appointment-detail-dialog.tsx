"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DatePicker } from "@/components/shared/date-picker";
import { ErrorState } from "@/components/shared/error-state";
import { FormField } from "@/components/shared/form-field";
import { InlineAlert } from "@/components/shared/inline-alert";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvalidateAppointments } from "@/hooks/use-invalidate-appointments";
import { cancelAppointment, getAppointment, updateAppointment } from "@/lib/api/appointments";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { clinicToday, formatLongDate, formatShortDate, formatTimeRange } from "@/lib/format";
import { APPOINTMENT_STATUS, PAYMENT_METHOD_LABEL, SESSION_TYPE_LABEL } from "@/lib/labels";
import { queryKeys } from "@/lib/query/keys";
import {
  BOOKING_CONFLICT_MESSAGES,
  rescheduleSchema,
  type RescheduleValues,
} from "@/lib/validations/appointment";
import type { Appointment } from "@/types/api";

import { SlotPicker } from "./slot-picker";
import { TherapistSelect } from "./therapist-select";

interface AppointmentDetailDialogProps {
  appointmentId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function AppointmentDetailDialog({
  appointmentId,
  onOpenChange,
}: AppointmentDetailDialogProps) {
  return (
    <Dialog open={Boolean(appointmentId)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        {appointmentId && (
          <AppointmentDetail id={appointmentId} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AppointmentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.appointments.detail(id),
    queryFn: () => getAppointment(id),
  });

  if (error) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Appointment</DialogTitle>
          <DialogDescription className="sr-only">Appointment details</DialogDescription>
        </DialogHeader>
        <ErrorState error={error} onRetry={() => refetch()} />
      </>
    );
  }
  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <DialogTitle className="sr-only">Loading appointment</DialogTitle>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return mode === "reschedule" ? (
    <RescheduleForm appointment={data} onBack={() => setMode("view")} />
  ) : (
    <AppointmentSummary
      appointment={data}
      onReschedule={() => setMode("reschedule")}
      onClose={onClose}
    />
  );
}

function AppointmentSummary({
  appointment,
  onReschedule,
  onClose,
}: {
  appointment: Appointment;
  onReschedule: () => void;
  onClose: () => void;
}) {
  const invalidate = useInvalidateAppointments();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const isBooked = appointment.status === "BOOKED";
  // The API refuses to complete appointments dated in the future.
  const canComplete = isBooked && appointment.appointment_date <= clinicToday();

  const complete = useMutation({
    mutationFn: () => updateAppointment(appointment.id, { status: "COMPLETED" }),
    onSuccess: () => {
      invalidate();
      toast.success("Appointment marked as completed");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const cancel = useMutation({
    mutationFn: () => cancelAppointment(appointment.id),
    onSuccess: () => {
      invalidate();
      setConfirmCancel(false);
      toast.success("Appointment cancelled", { description: "The slot is free again." });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Patient",
      value: (
        <Link
          href={`/patients/${appointment.patient.id}`}
          className="font-medium hover:text-primary"
          onClick={onClose}
        >
          {appointment.patient.full_name}
        </Link>
      ),
    },
    {
      label: "Therapist",
      value: `${appointment.therapist.name} · ${appointment.therapist.specialty}`,
    },
    { label: "Date", value: formatLongDate(appointment.appointment_date) },
    {
      label: "Time",
      value: (
        <span className="font-mono">
          {formatTimeRange(appointment.start_time, appointment.end_time)}
        </span>
      ),
    },
    { label: "Session type", value: SESSION_TYPE_LABEL[appointment.session_type] },
    { label: "Payment method", value: PAYMENT_METHOD_LABEL[appointment.payment_method] },
    {
      label: "Notes",
      value: appointment.notes ?? <span className="text-muted-foreground">No notes</span>,
    },
  ];

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <DialogTitle>Appointment</DialogTitle>
          <StatusBadge meta={APPOINTMENT_STATUS[appointment.status]} />
        </div>
        <DialogDescription>
          {appointment.patient.full_name} · {formatShortDate(appointment.appointment_date)} at{" "}
          {appointment.start_time}
        </DialogDescription>
      </DialogHeader>

      <dl className="divide-y divide-border rounded-lg border border-border">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[9rem_1fr] gap-4 px-4 py-2.5 text-sm">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>

      {isBooked && !canComplete && (
        <p className="text-xs text-muted-foreground">
          This appointment can be marked as completed on or after its date.
        </p>
      )}

      <DialogFooter className="sm:justify-between">
        {isBooked ? (
          <>
            <Button
              variant="ghost"
              className="text-danger hover:text-danger"
              onClick={() => setConfirmCancel(true)}
            >
              <XCircle aria-hidden />
              Cancel appointment
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="secondary" onClick={onReschedule}>
                <CalendarClock aria-hidden />
                Reschedule
              </Button>
              {canComplete && (
                <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
                  <CheckCircle2 aria-hidden />
                  {complete.isPending ? "Saving…" : "Mark completed"}
                </Button>
              )}
            </div>
          </>
        ) : (
          <Button variant="secondary" className="sm:ml-auto" onClick={onClose}>
            Close
          </Button>
        )}
      </DialogFooter>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this appointment?"
        description="The time slot will be freed for other bookings. The appointment stays in the patient's history as cancelled."
        confirmLabel="Cancel appointment"
        cancelLabel="Keep appointment"
        destructive
        pending={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      />
    </>
  );
}

function RescheduleForm({ appointment, onBack }: { appointment: Appointment; onBack: () => void }) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAppointments();
  const [problem, setProblem] = useState<string | null>(null);
  const form = useForm<RescheduleValues>({
    resolver: zodResolver(rescheduleSchema),
    defaultValues: {
      therapist_id: appointment.therapist_id,
      appointment_date: appointment.appointment_date,
      start_time: "",
    },
  });
  const { errors } = form.formState;
  const [therapistId, date] = useWatch({
    control: form.control,
    name: ["therapist_id", "appointment_date"],
  });

  const reschedule = useMutation({
    mutationFn: (values: RescheduleValues) => updateAppointment(appointment.id, values),
    onSuccess: (updated) => {
      invalidate();
      toast.success("Appointment rescheduled", {
        description: `${formatShortDate(updated.appointment_date)} at ${updated.start_time} with ${updated.therapist.name}`,
      });
      onBack();
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 400)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
        form.setValue("start_time", "");
        setProblem(BOOKING_CONFLICT_MESSAGES[error.code] ?? error.message);
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Reschedule appointment</DialogTitle>
        <DialogDescription>
          {appointment.patient.full_name} is currently booked on{" "}
          {formatShortDate(appointment.appointment_date)} at{" "}
          <span className="font-mono">{appointment.start_time}</span> with{" "}
          {appointment.therapist.name}.
        </DialogDescription>
      </DialogHeader>

      <form
        id="reschedule-form"
        noValidate
        className="space-y-5"
        onSubmit={form.handleSubmit((values) => {
          setProblem(null);
          reschedule.mutate(values);
        })}
      >
        {problem && (
          <InlineAlert title="Slot no longer available" tone="warning">
            {problem}
          </InlineAlert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="reschedule-therapist"
            label="Therapist"
            error={errors.therapist_id?.message}
          >
            <Controller
              control={form.control}
              name="therapist_id"
              render={({ field }) => (
                <TherapistSelect
                  id="reschedule-therapist"
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    form.setValue("start_time", "");
                  }}
                />
              )}
            />
          </FormField>
          <FormField id="reschedule-date" label="Date" error={errors.appointment_date?.message}>
            <Controller
              control={form.control}
              name="appointment_date"
              render={({ field }) => (
                <DatePicker
                  id="reschedule-date"
                  value={field.value}
                  min={clinicToday()}
                  onChange={(value) => {
                    field.onChange(value);
                    form.setValue("start_time", "");
                  }}
                />
              )}
            />
          </FormField>
        </div>
        <FormField id="reschedule-time" label="New time" error={errors.start_time?.message}>
          <Controller
            control={form.control}
            name="start_time"
            render={({ field }) => (
              <SlotPicker
                therapistId={therapistId}
                date={date}
                value={field.value}
                invalid={Boolean(errors.start_time)}
                onChange={(value) => {
                  setProblem(null);
                  field.onChange(value);
                }}
              />
            )}
          />
        </FormField>
      </form>

      <DialogFooter>
        <Button variant="secondary" onClick={onBack} disabled={reschedule.isPending}>
          Back
        </Button>
        <Button type="submit" form="reschedule-form" disabled={reschedule.isPending}>
          {reschedule.isPending ? "Saving…" : "Confirm reschedule"}
        </Button>
      </DialogFooter>
    </>
  );
}
