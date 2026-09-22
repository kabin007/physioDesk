"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarOff, CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { DatePicker } from "@/components/shared/date-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { useTherapistOptions } from "@/hooks/use-therapists";
import { getSchedule } from "@/lib/api/schedule";
import { clinicToday, formatLongDate, shiftDate } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";

import { AppointmentDetailDialog } from "./appointment-detail-dialog";
import { BookAppointmentDialog, type BookingPrefill } from "./book-appointment-dialog";
import { ScheduleGrid } from "./schedule-grid";

export function ScheduleView() {
  const params = useSearchParamState();
  const requestedDate = params.get("date") ?? null; // null: the backend's clinic "today"
  const therapistFilter = params.get("therapist");
  const therapistOptions = useTherapistOptions({ activeOnly: true });

  const [booking, setBooking] = useState<BookingPrefill | null>(null);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.schedule.day(requestedDate, therapistFilter),
    queryFn: () => getSchedule(requestedDate, therapistFilter),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const date = data?.date ?? requestedDate ?? clinicToday();
  const today = clinicToday();

  // /schedule?book=1 (e.g. from the dashboard) opens the booking dialog directly.
  const bookingFromUrl = params.get("book") === "1";
  const bookingPrefill = booking ?? (bookingFromUrl ? { date: date < today ? today : date } : null);
  const closeBooking = () => {
    setBooking(null);
    if (bookingFromUrl) params.set({ book: undefined });
  };

  const goTo = (next: string) => params.set({ date: next === today ? undefined : next });

  return (
    <>
      <PageHeader
        title="Schedule"
        description={formatLongDate(date)}
        actions={
          <Button onClick={() => setBooking({ date: date < today ? today : date })}>
            <CalendarPlus aria-hidden />
            Book appointment
          </Button>
        }
      />

      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous day"
              onClick={() => goTo(shiftDate(date, -1))}
            >
              <ChevronLeft />
            </Button>
            <Button variant="secondary" onClick={() => goTo(today)} disabled={date === today}>
              Today
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next day"
              onClick={() => goTo(shiftDate(date, 1))}
            >
              <ChevronRight />
            </Button>
            <DatePicker value={date} onChange={goTo} className="w-44 justify-start font-normal" />
          </div>
          <FilterSelect
            label="Show therapist"
            allLabel="All therapists"
            value={therapistFilter}
            options={therapistOptions}
            onChange={(therapist) => params.set({ therapist })}
            className="w-full sm:w-56"
          />
          <Legend />
        </div>

        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load the schedule" />
        ) : isPending ? (
          <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading schedule">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-[420px] w-full" />
          </div>
        ) : data.therapists.every((t) => t.slots.length === 0) ? (
          <EmptyState
            icon={CalendarOff}
            title="No therapists are scheduled for this day."
            description="Pick another date, or add therapists and working hours first."
          />
        ) : (
          <ScheduleGrid
            schedule={data}
            isToday={date === today}
            onAppointment={setAppointmentId}
            onOpenSlot={(therapist, slot) =>
              setBooking({
                therapistId: therapist.therapist_id,
                date: therapist.date,
                startTime: slot.start_time,
              })
            }
          />
        )}
      </Panel>

      <BookAppointmentDialog
        open={Boolean(bookingPrefill)}
        onOpenChange={(open) => !open && closeBooking()}
        initial={bookingPrefill ?? undefined}
      />
      <AppointmentDetailDialog
        appointmentId={appointmentId}
        onOpenChange={(open) => !open && setAppointmentId(null)}
      />
    </>
  );
}

function Legend() {
  const items = [
    { label: "Open", swatch: "border border-border bg-card" },
    { label: "Booked", swatch: "border-l-[3px] border-primary bg-primary-soft" },
    { label: "Completed", swatch: "border-l-[3px] border-tertiary bg-tertiary-soft" },
    { label: "Unavailable", swatch: "bg-hatch border border-border" },
  ];
  return (
    <ul
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground lg:ml-auto"
      aria-label="Legend"
    >
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-4 rounded-[3px] ${item.swatch}`} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
