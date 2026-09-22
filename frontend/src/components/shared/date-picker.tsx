"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, parseDateOnly, toDateOnly } from "@/lib/format";

interface DatePickerProps {
  id?: string;
  value: string | undefined;
  onChange: (value: string) => void;
  /** Dates before this "YYYY-MM-DD" are disabled. */
  min?: string;
  placeholder?: string;
  className?: string;
  "aria-invalid"?: boolean;
}

/** Date-only picker working in "YYYY-MM-DD" strings (clinic-local calendar dates). */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  placeholder = "Pick a date",
  className,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseDateOnly(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="secondary"
          className={className ?? "w-full justify-start font-normal"}
          aria-invalid={aria["aria-invalid"]}
        >
          <CalendarDays className="text-muted-foreground" aria-hidden />
          {value ? formatDate(value) : <span className="text-muted-foreground">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          required
          selected={selected}
          defaultMonth={selected}
          weekStartsOn={1}
          disabled={min ? { before: parseDateOnly(min) } : undefined}
          onSelect={(date) => {
            // Re-picking the selected day just closes the picker.
            if (date) onChange(toDateOnly(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
