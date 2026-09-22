"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BookAppointmentDialog } from "@/components/schedule/book-appointment-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageHeader } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/panel";
import { ProfileSkeleton } from "@/components/shared/skeletons";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api/errors";
import { getPatient } from "@/lib/api/patients";
import { formatInstantDate } from "@/lib/format";
import { GENDER_LABEL, PATIENT_STATUS } from "@/lib/labels";
import { queryKeys } from "@/lib/query/keys";
import type { PatientDetail } from "@/types/api";

import { DeletePatientDialog } from "./delete-patient-dialog";
import { PatientInvoices, PatientSessions } from "./patient-history";
import { PatientMetrics } from "./patient-metrics";
import { PatientFormDialog } from "./patient-form-dialog";

export function PatientProfile({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [booking, setBooking] = useState(false);

  const {
    data: patient,
    error,
    isPending,
    refetch,
  } = useQuery({
    queryKey: queryKeys.patients.detail(patientId),
    queryFn: () => getPatient(patientId),
  });

  if (error instanceof ApiError && (error.status === 404 || error.status === 422)) {
    return (
      <NotFoundState
        title="Patient not found"
        description="This patient doesn't exist or may have been deleted."
        backHref="/patients"
        backLabel="Back to patients"
      />
    );
  }
  if (error) {
    return (
      <Panel>
        <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load this patient" />
      </Panel>
    );
  }
  if (isPending) return <ProfileSkeleton />;

  return (
    <>
      <PageHeader
        back={{ href: "/patients", label: "Patients" }}
        title={patient.full_name}
        meta={<StatusBadge meta={PATIENT_STATUS[patient.status]} />}
        description={patient.condition}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Edit
            </Button>
            <Button onClick={() => setBooking(true)}>
              <CalendarPlus aria-hidden />
              Book appointment
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                  <Trash2 aria-hidden />
                  Delete patient
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="space-y-6">
        <Panel className="overflow-hidden">
          <PatientDetails patient={patient} />
          <div className="border-t border-border">
            <PatientMetrics stats={patient.stats} />
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <Tabs defaultValue="sessions" className="gap-0">
            <div className="border-b border-border px-5 pt-3">
              <TabsList variant="line" className="h-10 gap-4 p-0">
                <TabsTrigger value="sessions" className="px-0.5">
                  Sessions
                </TabsTrigger>
                <TabsTrigger value="billing" className="px-0.5">
                  Billing
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="sessions">
              <PatientSessions patientId={patient.id} />
            </TabsContent>
            <TabsContent value="billing">
              <PatientInvoices patientId={patient.id} />
            </TabsContent>
          </Tabs>
        </Panel>
      </div>

      <PatientFormDialog open={editing} onOpenChange={setEditing} patient={patient} />
      <DeletePatientDialog
        patient={deleting ? patient : null}
        onOpenChange={setDeleting}
        onDeleted={() => router.replace("/patients")}
      />
      <BookAppointmentDialog
        open={booking}
        onOpenChange={setBooking}
        initial={{
          patient: { id: patient.id, full_name: patient.full_name, phone: patient.phone },
          therapistId: patient.assigned_therapist_id ?? undefined,
        }}
      />
    </>
  );
}

function PatientDetails({ patient }: { patient: PatientDetail }) {
  const items: { label: string; value: React.ReactNode; mono?: boolean }[] = [
    { label: "Phone", value: patient.phone, mono: true },
    { label: "Age", value: patient.age, mono: true },
    { label: "Gender", value: GENDER_LABEL[patient.gender] },
    { label: "Address", value: patient.address ?? "—" },
    { label: "Assigned therapist", value: patient.assigned_therapist?.name ?? "Unassigned" },
    { label: "Package", value: patient.package ?? "—" },
    { label: "Condition", value: patient.condition },
    { label: "Patient since", value: formatInstantDate(patient.created_at) },
  ];
  return (
    <dl className="grid gap-x-8 gap-y-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[12px] font-medium tracking-[0.02em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className={item.mono ? "mt-1 font-mono text-[13.5px]" : "mt-1 text-sm"}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
