import { InlineAlert } from "@/components/shared/inline-alert";
import { SCHEDULE_CONFLICT_TITLE } from "@/lib/validations/therapist";

/** Explains a 409 SCHEDULE_CHANGE_CONFLICT: the backend refuses to strand upcoming bookings. */
export function ScheduleConflictAlert({ detail }: { detail: string }) {
  return (
    <InlineAlert tone="warning" title={SCHEDULE_CONFLICT_TITLE}>
      <p>{detail}</p>
      <p className="mt-1">
        Reschedule or cancel those appointments from the Schedule page first, then try again.
      </p>
    </InlineAlert>
  );
}
