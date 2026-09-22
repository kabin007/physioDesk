"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarPlus, Stethoscope, UserCheck, Wallet } from "lucide-react";
import Link from "next/link";

import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/panel";
import { StatCardSkeleton, TableSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { getDashboard } from "@/lib/api/dashboard";
import { formatLongDate, formatMoney } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";

import { RecentPatients } from "./recent-patients";
import { StatCard } from "./stat-card";
import { TherapistCapacityPanel } from "./therapist-capacity";

export function DashboardView() {
  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: getDashboard,
    refetchInterval: 60_000,
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          data
            ? `Today's clinic overview · ${formatLongDate(data.date)}`
            : "Today's clinic overview"
        }
        actions={
          <Button asChild>
            <Link href="/schedule?book=1">
              <CalendarPlus aria-hidden />
              Book appointment
            </Link>
          </Button>
        }
      />

      {error ? (
        <Panel>
          <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load the dashboard" />
        </Panel>
      ) : (
        <div className="space-y-6">
          <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {isPending ? (
              Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard
                  label="Patients seen today"
                  value={data.patients_seen_today}
                  detail="Distinct patients with a completed session"
                  icon={UserCheck}
                />
                <StatCard
                  label="Therapists on duty"
                  value={data.therapists_on_duty_today}
                  detail="Working today, overrides included"
                  icon={Stethoscope}
                />
                <StatCard
                  label="Revenue collected"
                  value={formatMoney(data.revenue_collected_today)}
                  detail="Paid invoices settled today"
                  icon={Wallet}
                  mono
                />
                <StatCard
                  label="Open slots remaining"
                  value={data.open_slots_remaining_today}
                  detail={
                    <>
                      <span className="font-mono">{data.total_slots_today}</span> total ·{" "}
                      <span className="font-mono">{data.booked_slots_today}</span> booked
                    </>
                  }
                  icon={CalendarCheck}
                />
              </>
            )}
          </section>

          {isPending ? (
            <>
              <Panel>
                <TableSkeleton rows={4} columns={3} />
              </Panel>
              <Panel>
                <TableSkeleton rows={5} columns={6} />
              </Panel>
            </>
          ) : (
            <>
              <TherapistCapacityPanel capacity={data.therapist_capacity} date={data.date} />
              <RecentPatients patients={data.recent_patients} />
            </>
          )}
        </div>
      )}
    </>
  );
}
