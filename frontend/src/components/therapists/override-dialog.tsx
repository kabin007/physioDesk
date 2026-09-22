"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { createOverride, updateOverride } from "@/lib/api/therapists";
import { clinicToday, formatDate } from "@/lib/format";
import {
  overrideDefaults,
  overrideSchema,
  toOverridePayload,
  type OverrideFormValues,
} from "@/lib/validations/therapist";
import type { ScheduleOverride, Therapist } from "@/types/api";

import { ScheduleConflictAlert } from "./schedule-conflict-alert";
import { useInvalidateTherapists } from "./use-invalidate-therapists";

interface OverrideDialogProps {
  therapist: Therapist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  override?: ScheduleOverride;
}

export function OverrideDialog({ therapist, open, onOpenChange, override }: OverrideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <OverrideForm therapist={therapist} override={override} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function OverrideForm({
  therapist,
  override,
  onDone,
}: {
  therapist: Therapist;
  override?: ScheduleOverride;
  onDone: () => void;
}) {
  const invalidate = useInvalidateTherapists();
  const [problem, setProblem] = useState<ApiError | null>(null);
  const form = useForm<OverrideFormValues>({
    resolver: zodResolver(overrideSchema),
    defaultValues: overrideDefaults(override, clinicToday()),
  });
  const { errors } = form.formState;
  const kind = useWatch({ control: form.control, name: "kind" });

  const save = useMutation({
    mutationFn: (values: OverrideFormValues) => {
      const payload = toOverridePayload(values);
      return override
        ? updateOverride(therapist.id, override.id, payload)
        : createOverride(therapist.id, payload);
    },
    onSuccess: (saved) => {
      invalidate();
      toast.success(override ? "Schedule override updated" : "Schedule override added", {
        description: `${therapist.name} · ${formatDate(saved.date)}`,
      });
      onDone();
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 400)) setProblem(error);
      else toast.error(errorMessage(error));
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{override ? "Edit schedule override" : "Add schedule override"}</DialogTitle>
        <DialogDescription>
          Replaces {therapist.name}&apos;s regular hours on one date: a day off or custom hours.
        </DialogDescription>
      </DialogHeader>

      <form
        id="override-form"
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => {
          setProblem(null);
          save.mutate(values);
        })}
      >
        {problem &&
          (problem.code === "SCHEDULE_CHANGE_CONFLICT" ? (
            <ScheduleConflictAlert detail={problem.message} />
          ) : problem.code === "SCHEDULE_OVERRIDE_EXISTS" ? (
            <InlineAlert tone="warning">
              There&apos;s already an override for this date. Edit that override instead, or pick another date.
            </InlineAlert>
          ) : (
            <InlineAlert>{problem.message}</InlineAlert>
          ))}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="override-date" label="Date" error={errors.date?.message}>
            <Controller
              control={form.control}
              name="date"
              render={({ field }) => (
                <DatePicker id="override-date" value={field.value} min={clinicToday()} onChange={field.onChange} />
              )}
            />
          </FormField>
          <FormField id="override-kind" label="Type">
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <ToggleGroup
                  id="override-kind"
                  type="single"
                  variant="outline"
                  value={field.value}
                  onValueChange={(value) => value && field.onChange(value)}
                  className="w-full"
                >
                  <ToggleGroupItem value="DAY_OFF" className="flex-1">Day off</ToggleGroupItem>
                  <ToggleGroupItem value="CUSTOM_HOURS" className="flex-1">Custom hours</ToggleGroupItem>
                </ToggleGroup>
              )}
            />
          </FormField>
        </div>

        {kind === "CUSTOM_HOURS" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="override-start" label="Start" error={errors.start_time?.message}>
              <Input {...fieldAria("override-start", errors.start_time?.message)} type="time" step={60} className="font-mono" {...form.register("start_time")} />
            </FormField>
            <FormField id="override-end" label="End" error={errors.end_time?.message}>
              <Input {...fieldAria("override-end", errors.end_time?.message)} type="time" step={60} className="font-mono" {...form.register("end_time")} />
            </FormField>
          </div>
        )}

        <FormField id="override-note" label="Note" optional error={errors.note?.message}>
          <Input {...fieldAria("override-note", errors.note?.message)} placeholder="e.g. Annual leave, conference" {...form.register("note")} />
        </FormField>
      </form>

      <DialogFooter>
        <Button variant="secondary" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" form="override-form" disabled={save.isPending}>
          {save.isPending ? "Saving…" : override ? "Save override" : "Add override"}
        </Button>
      </DialogFooter>
    </>
  );
}
