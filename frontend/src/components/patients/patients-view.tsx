"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Plus, Trash2, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Panel } from "@/components/shared/panel";
import { SearchInput } from "@/components/shared/search-input";
import { TableSkeleton } from "@/components/shared/skeletons";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { useTherapistOptions } from "@/hooks/use-therapists";
import { listPatients, type PatientFilters } from "@/lib/api/patients";
import { PATIENT_STATUS, statusOptions } from "@/lib/labels";
import { queryKeys } from "@/lib/query/keys";
import type { Patient, PatientStatus } from "@/types/api";

import { DeletePatientDialog } from "./delete-patient-dialog";
import { PatientFormDialog } from "./patient-form-dialog";

const PAGE_SIZE = 20;

export function PatientsView() {
  const router = useRouter();
  const params = useSearchParamState();
  const therapistOptions = useTherapistOptions();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState<Patient | null>(null);

  const filters: PatientFilters = {
    page: Number(params.get("page") ?? 1),
    page_size: PAGE_SIZE,
    search: params.get("search"),
    therapist_id: params.get("therapist_id"),
    status: params.get("status") as PatientStatus | undefined,
  };
  const hasFilters = Boolean(filters.search || filters.therapist_id || filters.status);

  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: queryKeys.patients.list(filters),
    queryFn: () => listPatients(filters),
    placeholderData: keepPreviousData,
  });

  // Any filter change goes back to the first page.
  const setFilter = (updates: Record<string, string | undefined>) =>
    params.set({ ...updates, page: undefined });

  return (
    <>
      <PageHeader
        title="Patients"
        description="Everyone registered with the clinic."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Add patient
          </Button>
        }
      />

      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput
            label="Search patients"
            placeholder="Search by name or phone…"
            value={filters.search ?? ""}
            onChange={(search) => setFilter({ search })}
          />
          <FilterSelect
            label="Filter by therapist"
            allLabel="All therapists"
            value={filters.therapist_id}
            options={therapistOptions}
            onChange={(therapist_id) => setFilter({ therapist_id })}
            className="w-full sm:w-52"
          />
          <FilterSelect
            label="Filter by status"
            allLabel="All statuses"
            value={filters.status}
            options={statusOptions(PATIENT_STATUS)}
            onChange={(status) => setFilter({ status })}
          />
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setFilter({ search: undefined, therapist_id: undefined, status: undefined })
              }
            >
              Clear filters
            </Button>
          )}
          {isFetching && !isPending && (
            <span className="text-xs text-muted-foreground sm:ml-auto" aria-live="polite">
              Updating…
            </span>
          )}
        </div>

        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load patients" />
        ) : isPending ? (
          <TableSkeleton columns={7} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No patients found"
            description={
              hasFilters
                ? "Try changing your filters or add a new patient."
                : "Add your first patient to get started."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Patient</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Therapist</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((patient) => (
                    <TableRow
                      key={patient.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/patients/${patient.id}`)}
                    >
                      <TableCell>
                        <Link
                          href={`/patients/${patient.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {patient.full_name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-[13px] text-muted-foreground">
                        {patient.phone}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px]">
                        {patient.age}
                      </TableCell>
                      <TableCell className="max-w-56 truncate">{patient.condition}</TableCell>
                      <TableCell>
                        {patient.assigned_therapist?.name ?? (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {patient.package ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge meta={PATIENT_STATUS[patient.status]} />
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${patient.full_name}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem asChild>
                              <Link href={`/patients/${patient.id}`}>
                                <UserRound aria-hidden />
                                View profile
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setEditing(patient)}>
                              <Pencil aria-hidden />
                              Edit details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setDeleting(patient)}
                            >
                              <Trash2 aria-hidden />
                              Delete patient
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination
              page={data.page}
              pages={data.pages}
              total={data.total}
              pageSize={data.page_size}
              noun="patients"
              onPageChange={(page) => params.set({ page: page > 1 ? page : undefined })}
            />
          </>
        )}
      </Panel>

      <PatientFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(patient) => router.push(`/patients/${patient.id}`)}
      />
      <PatientFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        patient={editing ?? undefined}
      />
      <DeletePatientDialog patient={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </>
  );
}
