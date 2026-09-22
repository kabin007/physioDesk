"use client";

import { Check, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "cn";

import { CLINIC_TIMEZONE, formatTimeRange, minutesOf } from "@/lib/format";
import { AVAILABILITY_LABEL } from "@/lib/labels";
import type { Schedule, ScheduleSlot, TherapistSchedule } from "@/types/api";

/**
 * Day view: therapists as columns, time as rows. Therapists can have different slot
 * lengths (e.g. 30/45/60 minutes), so every slot is positioned on a shared minute axis
 * instead of forcing a single row height.
 */

const PX_PER_MINUTE = 1.6;
const TIME_COLUMN = 64;

interface ScheduleGridProps {
  schedule: Schedule;
  isToday: boolean;
  onOpenSlot: (therapist: TherapistSchedule, slot: ScheduleSlot) => void;
  onAppointment: (appointmentId: string) => void;
}

function useClinicMinutesNow(enabled: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const read = () => {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: CLINIC_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
      setNow(value("hour") * 60 + value("minute"));
    };
    read();
    const timer = setInterval(read, 60_000);
    return () => clearInterval(timer);
  }, [enabled]);
  return enabled ? now : null;
}

export function ScheduleGrid({ schedule, isToday, onOpenSlot, onAppointment }: ScheduleGridProps) {
  const therapists = schedule.therapists;
  const slots = therapists.flatMap((t) => t.slots);
  const now = useClinicMinutesNow(isToday);
  if (slots.length === 0) return null;

  const dayStart = Math.floor(Math.min(...slots.map((s) => minutesOf(s.start_time))) / 60) * 60;
  const dayEnd = Math.ceil(Math.max(...slots.map((s) => minutesOf(s.end_time))) / 60) * 60;
  const height = (dayEnd - dayStart) * PX_PER_MINUTE;
  const y = (time: string | number) =>
    ((typeof time === "number" ? time : minutesOf(time)) - dayStart) * PX_PER_MINUTE;
  const gridTemplateColumns = `${TIME_COLUMN}px repeat(${therapists.length}, minmax(172px, 1fr))`;
  const marks = Array.from({ length: (dayEnd - dayStart) / 30 + 1 }, (_, i) => dayStart + i * 30);

  return (
    <div className="max-h-[calc(100dvh-236px)] min-h-[420px] overflow-auto" tabIndex={-1}>
      <div className="min-w-max">
        {/* Header row */}
        <div
          className="sticky top-0 z-20 grid border-b border-border bg-card"
          style={{ gridTemplateColumns }}
        >
          <div className="sticky left-0 z-10 bg-card" />
          {therapists.map((therapist) => (
            <TherapistHeader key={therapist.therapist_id} therapist={therapist} />
          ))}
        </div>

        {/* Body */}
        <div className="relative grid" style={{ gridTemplateColumns, height }}>
          {/* Time axis */}
          <div className="sticky left-0 z-10 border-r border-border bg-card" aria-hidden>
            {marks.slice(0, -1).map((minute) => (
              <span
                key={minute}
                className={cn(
                  "absolute right-2.5 -translate-y-1/2 font-mono text-[11px]",
                  minute % 60 === 0 ? "text-foreground/70" : "text-muted-foreground/70",
                )}
                style={{ top: y(minute) + (minute === dayStart ? 8 : 0) }}
              >
                {String(Math.floor(minute / 60)).padStart(2, "0")}:{String(minute % 60).padStart(2, "0")}
              </span>
            ))}
          </div>

          {therapists.map((therapist) => (
            <TherapistColumn
              key={therapist.therapist_id}
              therapist={therapist}
              y={y}
              marks={marks}
              onOpenSlot={onOpenSlot}
              onAppointment={onAppointment}
            />
          ))}

          {now !== null && now >= dayStart && now <= dayEnd && (
            <div
              className="pointer-events-none absolute right-0 z-10 flex items-center"
              style={{ top: y(now), left: TIME_COLUMN - 5 }}
              aria-hidden
            >
              <span className="size-2.5 rounded-full bg-danger" />
              <span className="h-px flex-1 bg-danger/70" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TherapistHeader({ therapist }: { therapist: TherapistSchedule }) {
  const source = therapist.availability_source;
  return (
    <div className="border-l border-border px-3 py-2.5">
      <p className="truncate text-[13.5px] font-medium text-foreground">{therapist.therapist_name}</p>
      <p className="truncate text-xs text-muted-foreground">{therapist.specialty}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {therapist.is_working && therapist.working_start && therapist.working_end ? (
          <span className="font-mono text-[11.5px] text-foreground/80">
            {formatTimeRange(therapist.working_start, therapist.working_end)}
          </span>
        ) : null}
        {source !== "REGULAR" && (
          <span
            className={cn(
              "rounded-full px-2 py-px text-[11px] font-medium",
              source === "OVERRIDE_HOURS"
                ? "bg-primary-soft text-primary-ink"
                : "bg-background text-muted-foreground ring-1 ring-border",
            )}
          >
            {AVAILABILITY_LABEL[source]}
          </span>
        )}
      </div>
    </div>
  );
}

interface TherapistColumnProps {
  therapist: TherapistSchedule;
  y: (time: string | number) => number;
  marks: number[];
  onOpenSlot: ScheduleGridProps["onOpenSlot"];
  onAppointment: ScheduleGridProps["onAppointment"];
}

function TherapistColumn({ therapist, y, marks, onOpenSlot, onAppointment }: TherapistColumnProps) {
  const working = therapist.is_working && therapist.working_start && therapist.working_end;
  return (
    <div className="bg-hatch relative border-l border-border">
      {working ? (
        <div
          className="absolute inset-x-0 bg-card"
          style={{
            top: y(therapist.working_start!),
            height: y(therapist.working_end!) - y(therapist.working_start!),
          }}
        />
      ) : (
        <div className="sticky top-3 z-[1] mx-3 mt-3 rounded-md border border-border bg-card/90 px-3 py-2 text-center text-xs text-muted-foreground">
          {AVAILABILITY_LABEL[therapist.availability_source]}
        </div>
      )}

      {/* Guide lines sit above the backgrounds and below the slots. */}
      {marks.map((minute) => (
        <div
          key={minute}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 border-t",
            minute % 60 === 0 ? "border-border" : "border-dashed border-border/70",
          )}
          style={{ top: y(minute) }}
        />
      ))}

      {therapist.slots.map((slot) => {
        if (slot.status === "THERAPIST_OFF") return null;
        const style = { top: y(slot.start_time) + 2, height: y(slot.end_time) - y(slot.start_time) - 4 };
        return slot.status === "BOOKED" ? (
          <BookedSlot key={slot.start_time} slot={slot} style={style} onClick={onAppointment} />
        ) : (
          <button
            key={slot.start_time}
            type="button"
            style={style}
            onClick={() => onOpenSlot(therapist, slot)}
            aria-label={`Book ${therapist.therapist_name} at ${slot.start_time}`}
            className="group absolute inset-x-1.5 flex items-start rounded-md border border-transparent px-2 py-1 text-left transition-colors duration-150 hover:border-primary/40 hover:bg-primary-soft/40 focus-visible:border-primary focus-visible:bg-primary-soft/40 focus-visible:outline-none"
          >
            <span className="font-mono text-[11px] text-muted-foreground/60 group-hover:hidden group-focus-visible:hidden">
              {slot.start_time}
            </span>
            <span className="hidden items-center gap-1 text-xs font-medium text-primary group-hover:flex group-focus-visible:flex">
              <Plus className="size-3.5" aria-hidden />
              Book <span className="font-mono">{slot.start_time}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BookedSlot({
  slot,
  style,
  onClick,
}: {
  slot: ScheduleSlot;
  style: React.CSSProperties;
  onClick: (appointmentId: string) => void;
}) {
  const completed = slot.appointment_status === "COMPLETED";
  return (
    <button
      type="button"
      style={style}
      onClick={() => slot.appointment_id && onClick(slot.appointment_id)}
      aria-label={`${slot.patient_name}, ${slot.start_time} to ${slot.end_time}${completed ? ", completed" : ""}`}
      className={cn(
        "absolute inset-x-1.5 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left shadow-[0_1px_1px_rgb(28_38_34/0.06)] transition-[filter] duration-150 hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
        completed
          ? "border-tertiary bg-tertiary-soft text-secondary-dark"
          : "border-primary bg-primary-soft text-primary-ink",
      )}
    >
      <span className="flex items-center gap-1 truncate text-[12.5px] leading-tight font-medium">
        {completed && <Check className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />}
        <span className="truncate">{slot.patient_name}</span>
      </span>
      <span className="block font-mono text-[11px] leading-tight opacity-75">
        {formatTimeRange(slot.start_time, slot.end_time)}
      </span>
    </button>
  );
}
