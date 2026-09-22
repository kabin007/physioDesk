"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";

import { Skeleton } from "@/components/ui/skeleton";
import { getSchedule } from "@/lib/api/schedule";
import { AVAILABILITY_LABEL } from "@/lib/labels";
import { queryKeys } from "@/lib/query/keys";

interface SlotPickerProps {
  therapistId: string | undefined;
  date: string | undefined;
  value: string | undefined;
  onChange: (startTime: string) => void;
  invalid?: boolean;
}

/**
 * Selectable OPEN slots for a therapist on a date, straight from GET /schedule (the
 * backend resolves overrides and existing bookings). Times cannot be typed freely.
 */
export function SlotPicker({ therapistId, date, value, onChange, invalid }: SlotPickerProps) {
  const enabled = Boolean(therapistId && date);
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.schedule.day(date ?? null, therapistId),
    queryFn: () => getSchedule(date ?? null, therapistId),
    enabled,
  });

  if (!enabled) {
    return <Hint>Choose a therapist and a date to see available times.</Hint>;
  }
  if (isPending) {
    return (
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    );
  }
  if (isError || !data?.therapists[0]) return <Hint>Couldn&apos;t load availability.</Hint>;

  const day = data.therapists[0];
  if (!day.is_working) {
    return (
      <Hint>
        {day.therapist_name} is not available on this date ({AVAILABILITY_LABEL[day.availability_source].toLowerCase()}).
      </Hint>
    );
  }
  const open = day.slots.filter((slot) => slot.status === "OPEN");
  if (open.length === 0) return <Hint>No open slots left on this date.</Hint>;

  return (
    <div
      role="radiogroup"
      aria-label="Available times"
      aria-invalid={invalid || undefined}
      className="grid grid-cols-4 gap-2 sm:grid-cols-6"
    >
      {open.map((slot) => {
        const selected = slot.start_time === value;
        return (
          <button
            key={slot.start_time}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(slot.start_time)}
            className={cn(
              "h-9 rounded-lg border font-mono text-[13px] transition-colors duration-150",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-foreground hover:border-primary/60 hover:bg-primary-soft/40",
            )}
          >
            {slot.start_time}
          </button>
        );
      })}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground">
      {children}
    </p>
  );
}
