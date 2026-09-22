import { cn } from "cn";

import { WEEKDAYS } from "@/lib/labels";

/** Compact M T W T F S S indicator of the weekly working days. */
export function WorkingDays({ days }: { days: number[] }) {
  return (
    <span className="inline-flex gap-1" aria-label={WEEKDAYS.filter((d) => days.includes(d.value)).map((d) => d.long).join(", ")}>
      {WEEKDAYS.map((day) => {
        const on = days.includes(day.value);
        return (
          <span
            key={day.value}
            aria-hidden
            className={cn(
              "flex size-6 items-center justify-center rounded-md text-[11px] font-medium",
              on ? "bg-primary-soft text-primary-ink" : "bg-background text-muted-foreground/50",
            )}
          >
            {day.short.charAt(0)}
          </span>
        );
      })}
    </span>
  );
}
