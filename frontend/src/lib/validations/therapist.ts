import { z } from "zod";

import { minutesOf } from "@/lib/format";
import type { ScheduleOverride, Therapist } from "@/types/api";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const therapistSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(120, "Keep it under 120 characters"),
    specialty: z
      .string()
      .trim()
      .min(1, "Enter a specialty")
      .max(120, "Keep it under 120 characters"),
    working_days: z.array(z.number().int().min(1).max(7)).min(1, "Choose at least one working day"),
    start_time: clock,
    end_time: clock,
    slot_duration_minutes: z
      .number({ error: "Enter a slot length" })
      .int("Whole minutes only")
      .min(5, "At least 5 minutes")
      .max(480, "At most 480 minutes"),
    is_active: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const span = minutesOf(values.end_time) - minutesOf(values.start_time);
    if (span <= 0) {
      ctx.addIssue({ code: "custom", path: ["end_time"], message: "End must be after start" });
    } else if (values.slot_duration_minutes > span) {
      ctx.addIssue({
        code: "custom",
        path: ["slot_duration_minutes"],
        message: "A slot must fit within the working hours",
      });
    }
  });

export type TherapistFormValues = z.infer<typeof therapistSchema>;

export function therapistDefaults(therapist?: Therapist): TherapistFormValues {
  return {
    name: therapist?.name ?? "",
    specialty: therapist?.specialty ?? "",
    working_days: therapist?.working_days ?? [1, 2, 3, 4, 5],
    start_time: therapist?.start_time ?? "09:00",
    end_time: therapist?.end_time ?? "17:00",
    slot_duration_minutes: therapist?.slot_duration_minutes ?? 30,
    is_active: therapist?.is_active ?? true,
  };
}

export const overrideSchema = z
  .object({
    date: z.string().min(1, "Choose a date"),
    kind: z.enum(["DAY_OFF", "CUSTOM_HOURS"]),
    start_time: z.string(),
    end_time: z.string(),
    note: z.string().trim().max(255, "Keep it under 255 characters"),
  })
  .superRefine((values, ctx) => {
    if (values.kind === "DAY_OFF") return;
    const valid = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!valid.test(values.start_time))
      ctx.addIssue({ code: "custom", path: ["start_time"], message: "Enter a start time" });
    if (!valid.test(values.end_time))
      ctx.addIssue({ code: "custom", path: ["end_time"], message: "Enter an end time" });
    else if (
      valid.test(values.start_time) &&
      minutesOf(values.end_time) <= minutesOf(values.start_time)
    ) {
      ctx.addIssue({ code: "custom", path: ["end_time"], message: "End must be after start" });
    }
  });

export type OverrideFormValues = z.infer<typeof overrideSchema>;

export function overrideDefaults(
  override: ScheduleOverride | undefined,
  date: string,
): OverrideFormValues {
  return {
    date: override?.date ?? date,
    kind: override && !override.is_day_off ? "CUSTOM_HOURS" : "DAY_OFF",
    start_time: override?.start_time ?? "09:00",
    end_time: override?.end_time ?? "13:00",
    note: override?.note ?? "",
  };
}

export function toOverridePayload(values: OverrideFormValues) {
  const dayOff = values.kind === "DAY_OFF";
  return {
    date: values.date,
    is_day_off: dayOff,
    start_time: dayOff ? null : values.start_time,
    end_time: dayOff ? null : values.end_time,
    note: values.note || null,
  };
}

/** Copy for 409s from schedule changes (codes from the FastAPI backend). */
export const SCHEDULE_CONFLICT_TITLE =
  "This schedule cannot be changed because appointments already exist during the affected period.";
