"use client";

import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { Panel, PanelHeader } from "@/components/shared/panel";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInstantDate, formatRelative } from "@/lib/format";
import { PATIENT_STATUS } from "@/lib/labels";
import type { RecentPatient } from "@/types/api";

export function RecentPatients({ patients }: { patients: RecentPatient[] }) {
  const router = useRouter();
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Recent patients"
        description="The latest patients added to the clinic."
        action={
          <Link href="/patients" className="text-[13px] font-medium text-primary hover:underline">
            View all
          </Link>
        }
      />
      {patients.length === 0 ? (
        <EmptyState icon={UserPlus} title="No patients yet" description="New patients will appear here." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Patient</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Therapist</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((patient) => (
                <TableRow
                  key={patient.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/patients/${patient.id}`)}
                >
                  <TableCell>
                    <Link
                      href={`/patients/${patient.id}`}
                      className="font-medium text-foreground hover:text-primary"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {patient.full_name}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">
                    {patient.condition}
                  </TableCell>
                  <TableCell>{patient.assigned_therapist?.name ?? <Unassigned />}</TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">
                    {patient.package ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge meta={PATIENT_STATUS[patient.status]} />
                  </TableCell>
                  <TableCell
                    className="text-right text-muted-foreground"
                    title={formatInstantDate(patient.created_at)}
                  >
                    {formatRelative(patient.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

function Unassigned() {
  return <span className="text-muted-foreground">Unassigned</span>;
}
