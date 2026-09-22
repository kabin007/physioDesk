"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, errorMessage } from "@/lib/api/errors";
import { createTherapist, updateTherapist } from "@/lib/api/therapists";
import { applyServerFieldErrors } from "@/lib/forms";
import { WEEKDAYS } from "@/lib/labels";
import {
  therapistDefaults,
  therapistSchema,
  type TherapistFormValues,
} from "@/lib/validations/therapist";
import type { Therapist } from "@/types/api";

import { ScheduleConflictAlert } from "./schedule-conflict-alert";
import { useInvalidateTherapists } from "./use-invalidate-therapists";

interface TherapistFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  therapist?: Therapist;
}

export function TherapistFormDialog({ open, onOpenChange, therapist }: TherapistFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <TherapistForm therapist={therapist} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TherapistForm({ therapist, onDone }: { therapist?: Therapist; onDone: () => void }) {
  const invalidate = useInvalidateTherapists();
  const [conflict, setConflict] = useState<ApiError | null>(null);
  const form = useForm<TherapistFormValues>({
    resolver: zodResolver(therapistSchema),
    defaultValues: therapistDefaults(therapist),
  });
  const { errors } = form.formState;

  const save = useMutation({
    mutationFn: (values: TherapistFormValues) =>
      therapist ? updateTherapist(therapist.id, values) : createTherapist(values),
    onSuccess: (saved) => {
      invalidate();
      toast.success(therapist ? "Therapist updated" : "Therapist added", { description: saved.name });
      onDone();
    },
    onError: (error, values) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 400)) {
        setConflict(error);
        return;
      }
      if (!applyServerFieldErrors(error, form.setError, Object.keys(values))) toast.error(errorMessage(error));
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{therapist ? "Edit therapist" : "Add therapist"}</DialogTitle>
        <DialogDescription>
          The weekly schedule defines bookable slots. Date-specific changes are made with schedule overrides.
        </DialogDescription>
      </DialogHeader>

      <form
        id="therapist-form"
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => {
          setConflict(null);
          save.mutate(values);
        })}
      >
        {conflict &&
          (conflict.code === "SCHEDULE_CHANGE_CONFLICT" ? (
            <ScheduleConflictAlert detail={conflict.message} />
          ) : (
            <InlineAlert>{conflict.message}</InlineAlert>
          ))}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="therapist-name" label="Name" error={errors.name?.message}>
            <Input {...fieldAria("therapist-name", errors.name?.message)} {...form.register("name")} />
          </FormField>
          <FormField id="specialty" label="Specialty" error={errors.specialty?.message}>
            <Input
              {...fieldAria("specialty", errors.specialty?.message)}
              placeholder="e.g. Sports physiotherapy"
              {...form.register("specialty")}
            />
          </FormField>
        </div>

        <FormField id="working_days" label="Working days" error={errors.working_days?.message}>
          <Controller
            control={form.control}
            name="working_days"
            render={({ field }) => (
              <ToggleGroup
                id="working_days"
                type="multiple"
                variant="outline"
                spacing={1}
                value={field.value.map(String)}
                onValueChange={(values) => field.onChange(values.map(Number).sort((a, b) => a - b))}
                className="flex flex-wrap"
              >
                {WEEKDAYS.map((day) => (
                  <ToggleGroupItem key={day.value} value={String(day.value)} aria-label={day.long} className="w-14">
                    {day.short}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
        </FormField>

        <div className="grid grid-cols-3 gap-4">
          <FormField id="start_time" label="Start" error={errors.start_time?.message}>
            <Input
              {...fieldAria("start_time", errors.start_time?.message)}
              type="time"
              step={60}
              className="font-mono"
              {...form.register("start_time")}
            />
          </FormField>
          <FormField id="end_time" label="End" error={errors.end_time?.message}>
            <Input
              {...fieldAria("end_time", errors.end_time?.message)}
              type="time"
              step={60}
              className="font-mono"
              {...form.register("end_time")}
            />
          </FormField>
          <FormField id="slot_duration_minutes" label="Slot (minutes)" error={errors.slot_duration_minutes?.message}>
            <Input
              {...fieldAria("slot_duration_minutes", errors.slot_duration_minutes?.message)}
              type="number"
              min={5}
              max={480}
              step={5}
              className="font-mono"
              {...form.register("slot_duration_minutes", { valueAsNumber: true })}
            />
          </FormField>
        </div>

        <Controller
          control={form.control}
          name="is_active"
          render={({ field }) => (
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <Label htmlFor="is_active" className="text-[13px] font-medium">
                  Active
                </Label>
                <p className="text-xs text-muted-foreground">Inactive therapists can&apos;t be booked.</p>
              </div>
              <Switch id="is_active" checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />
      </form>

      <DialogFooter>
        <Button variant="secondary" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" form="therapist-form" disabled={save.isPending}>
          {save.isPending ? "Saving…" : therapist ? "Save changes" : "Add therapist"}
        </Button>
      </DialogFooter>
    </>
  );
}
