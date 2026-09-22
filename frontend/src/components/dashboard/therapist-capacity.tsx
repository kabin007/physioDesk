import { CalendarOff } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Panel, PanelHeader } from "@/components/shared/panel";
import { formatTimeRange } from "@/lib/format";
import type { TherapistCapacity as Capacity } from "@/types/api";

/** One cell per slot: filled = booked, pale = open. */
function CapacityBar({ total, booked }: { total: number; booked: number }) {
  return (
    <div
      role="img"
      aria-label={`${booked} of ${total} slots booked`}
      className="flex h-2.5 w-full gap-[3px]"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={
            index < booked ? "flex-1 rounded-[2px] bg-primary" : "flex-1 rounded-[2px] bg-primary-soft"
          }
        />
      ))}
    </div>
  );
}

export function TherapistCapacityPanel({ capacity, date }: { capacity: Capacity[]; date: string }) {
  return (
    <Panel>
      <PanelHeader
        title="Today's therapist capacity"
        description="Booked versus available slots for every therapist on duty."
        action={
          <Link
            href={`/schedule?date=${date}`}
            className="text-[13px] font-medium text-primary hover:underline"
          >
            Open schedule
          </Link>
        }
      />
      {capacity.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="No therapists are on duty today"
          description="Nobody is scheduled to work on this date."
        />
      ) : (
        <ul className="divide-y divide-border">
          {capacity.map((row) => (
            <li
              key={row.therapist.id}
              className="grid grid-cols-1 items-center gap-3 px-5 py-4 md:grid-cols-[minmax(0,13rem)_7.5rem_minmax(0,1fr)_auto] md:gap-6"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{row.therapist.name}</p>
                <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                  {row.therapist.specialty}
                </p>
              </div>
              <p className="font-mono text-[12.5px] text-muted-foreground">
                {formatTimeRange(row.working_start, row.working_end)}
              </p>
              <CapacityBar total={row.total_slots} booked={row.booked_slots} />
              <dl className="flex gap-6 text-[12.5px] md:justify-end">
                <div className="flex items-baseline gap-1.5">
                  <dt className="sr-only">Booked</dt>
                  <dd className="font-mono text-sm font-medium text-foreground">
                    {row.booked_slots}
                  </dd>
                  <span className="text-muted-foreground" aria-hidden>
                    booked
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="sr-only">Available</dt>
                  <dd className="font-mono text-sm font-medium text-foreground">
                    {row.open_slots}
                  </dd>
                  <span className="text-muted-foreground" aria-hidden>
                    available
                  </span>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
