"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarX2, ReceiptText } from "lucide-react";
import { useState } from "react";

import { AppointmentDetailDialog } from "@/components/schedule/appointment-detail-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Money } from "@/components/shared/money";
import { Pagination } from "@/components/shared/pagination";
import { TableSkeleton } from "@/components/shared/skeletons";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPatientAppointments, listPatientInvoices } from "@/lib/api/patients";
import { formatDate, formatInstantDate, formatTimeRange } from "@/lib/format";
import {
  APPOINTMENT_STATUS,
  INVOICE_STATUS,
  PAYMENT_METHOD_LABEL,
  SESSION_TYPE_LABEL,
} from "@/lib/labels";
import { queryKeys } from "@/lib/query/keys";

const PAGE_SIZE = 10;

export function PatientSessions({ patientId }: { patientId: string }) {
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.patients.appointments(patientId, page),
    queryFn: () => listPatientAppointments(patientId, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isPending) return <TableSkeleton rows={4} columns={6} />;
  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={CalendarX2}
        title="No sessions yet"
        description="Booked, completed and cancelled appointments will appear here."
      />
    );
  }
  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Therapist</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((appointment) => (
              <TableRow
                key={appointment.id}
                className="cursor-pointer"
                onClick={() => setOpenId(appointment.id)}
              >
                <TableCell className="font-medium">
                  <button
                    type="button"
                    className="text-left hover:text-primary"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenId(appointment.id);
                    }}
                  >
                    {formatDate(appointment.appointment_date)}
                  </button>
                </TableCell>
                <TableCell className="font-mono text-[13px]">
                  {formatTimeRange(appointment.start_time, appointment.end_time)}
                </TableCell>
                <TableCell>{appointment.therapist.name}</TableCell>
                <TableCell>{SESSION_TYPE_LABEL[appointment.session_type]}</TableCell>
                <TableCell>
                  <StatusBadge meta={APPOINTMENT_STATUS[appointment.status]} />
                </TableCell>
                <TableCell className="max-w-72 truncate text-muted-foreground">
                  {appointment.notes ?? "—"}
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
        noun="sessions"
        onPageChange={setPage}
      />
      <AppointmentDetailDialog
        appointmentId={openId}
        onOpenChange={(open) => !open && setOpenId(null)}
      />
    </>
  );
}

export function PatientInvoices({ patientId }: { patientId: string }) {
  const [page, setPage] = useState(1);
  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.patients.invoices(patientId, page),
    queryFn: () => listPatientInvoices(patientId, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isPending) return <TableSkeleton rows={4} columns={6} />;
  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="No invoices yet"
        description="Invoices issued to this patient will appear here."
      />
    );
  }
  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Service</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-mono text-[13px] font-medium">
                  {invoice.invoice_number}
                </TableCell>
                <TableCell>{formatInstantDate(invoice.issued_at)}</TableCell>
                <TableCell className="max-w-64 truncate">{invoice.service}</TableCell>
                <TableCell className="text-right">
                  <Money value={invoice.total} className="text-[13px]" />
                </TableCell>
                <TableCell>
                  <StatusBadge meta={INVOICE_STATUS[invoice.status]} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {invoice.payment_method ? PAYMENT_METHOD_LABEL[invoice.payment_method] : "—"}
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
        noun="invoices"
        onPageChange={setPage}
      />
    </>
  );
}
