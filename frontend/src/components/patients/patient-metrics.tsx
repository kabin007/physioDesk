import { formatDate, formatMoney, formatShortDate } from "@/lib/format";
import type { PatientStats } from "@/types/api";

function Metric({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
      <dd
        className={
          mono
            ? "mt-1.5 font-mono text-lg font-medium tracking-[-0.01em]"
            : "mt-1 font-heading text-[26px] leading-none font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}

export function PatientMetrics({ stats }: { stats: PatientStats }) {
  const next = stats.next_appointment;
  return (
    <div>
      <dl className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
        <Metric label="Sessions completed" value={stats.completed_sessions} />
        <Metric label="Upcoming" value={stats.upcoming_appointments} />
        <Metric label="Total paid" value={formatMoney(stats.total_paid)} mono />
        <Metric label="Outstanding" value={formatMoney(stats.outstanding_balance)} mono />
      </dl>
      <div className="flex flex-wrap gap-x-8 gap-y-1 border-t border-border bg-surface-subtle px-5 py-3 text-[13px]">
        <p>
          <span className="text-muted-foreground">Last visit </span>
          <span className="font-medium">
            {stats.last_visit_date
              ? formatDate(stats.last_visit_date)
              : "No completed sessions yet"}
          </span>
        </p>
        <p>
          <span className="text-muted-foreground">Next appointment </span>
          <span className="font-medium">
            {next ? (
              <>
                {formatShortDate(next.appointment_date)} ·{" "}
                <span className="font-mono">{next.start_time}</span> with {next.therapist_name}
              </>
            ) : (
              "None booked"
            )}
          </span>
        </p>
        {stats.cancelled_appointments > 0 && (
          <p className="text-muted-foreground">
            <span className="font-mono">{stats.cancelled_appointments}</span> cancelled
          </p>
        )}
      </div>
    </div>
  );
}
