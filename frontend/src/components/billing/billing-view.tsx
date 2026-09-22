"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Ban, CircleCheck, MoreHorizontal, Pencil, Plus, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { ReadOnlyBadge } from "@/components/shared/read-only-badge";
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
import { errorMessage } from "@/lib/api/errors";
import { listInvoices, voidInvoice, type InvoiceFilters } from "@/lib/api/invoices";
import { usePermissions } from "@/lib/auth/session";
import { formatInstantDate } from "@/lib/format";
import { INVOICE_STATUS, PAYMENT_METHOD_LABEL, statusOptions } from "@/lib/labels";
import { queryKeys } from "@/lib/query/keys";
import type { Invoice, InvoiceStatus } from "@/types/api";

import { InvoiceFormDialog } from "./invoice-form-dialog";
import { MarkPaidDialog } from "./mark-paid-dialog";
import { useInvalidateBilling } from "./use-invalidate-billing";

const PAGE_SIZE = 20;

export function BillingView() {
  const params = useSearchParamState();
  const { manageInvoices, readOnlyAdminAreas } = usePermissions();
  const invalidate = useInvalidateBilling();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);

  const filters: InvoiceFilters = {
    page: Number(params.get("page") ?? 1),
    page_size: PAGE_SIZE,
    status: params.get("status") as InvoiceStatus | undefined,
    search: params.get("search"),
  };
  const hasFilters = Boolean(filters.status || filters.search);
  const setFilter = (updates: Record<string, string | undefined>) => params.set({ ...updates, page: undefined });

  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.invoices.list(filters),
    queryFn: () => listInvoices(filters),
    placeholderData: keepPreviousData,
  });

  const voidMutation = useMutation({
    mutationFn: (invoice: Invoice) => voidInvoice(invoice.id),
    onSuccess: (_, invoice) => {
      invalidate();
      setVoiding(null);
      toast.success("Invoice voided", { description: invoice.invoice_number });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <PageHeader
        title="Billing"
        description="Invoices and payments."
        meta={readOnlyAdminAreas && <ReadOnlyBadge />}
        actions={
          manageInvoices && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Create invoice
            </Button>
          )
        }
      />

      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
          <SearchInput
            label="Search invoices"
            placeholder="Invoice number or patient…"
            value={filters.search ?? ""}
            onChange={(search) => setFilter({ search })}
          />
          <FilterSelect
            label="Filter by status"
            allLabel="All statuses"
            value={filters.status}
            options={statusOptions(INVOICE_STATUS)}
            onChange={(status) => setFilter({ status })}
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => setFilter({ status: undefined, search: undefined })}>
              Clear filters
            </Button>
          )}
        </div>

        {error ? (
          <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load invoices" />
        ) : isPending ? (
          <TableSkeleton columns={7} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={hasFilters ? "No invoices match these filters." : "No invoices yet"}
            description={hasFilters ? "Try a different status or search." : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Invoice</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    {manageInvoices && (
                      <TableHead className="w-12">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((invoice) => (
                    <TableRow key={invoice.id} className={invoice.status === "VOID" ? "text-muted-foreground" : undefined}>
                      <TableCell className="font-mono text-[13px] font-medium">{invoice.invoice_number}</TableCell>
                      <TableCell>
                        <Link href={`/patients/${invoice.patient.id}`} className="hover:text-primary">
                          {invoice.patient.full_name}
                        </Link>
                      </TableCell>
                      <TableCell>{formatInstantDate(invoice.issued_at)}</TableCell>
                      <TableCell className="max-w-64 truncate">{invoice.service}</TableCell>
                      <TableCell className="text-right">
                        <Money value={invoice.total} className={invoice.status === "VOID" ? "text-[13px] line-through" : "text-[13px]"} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge meta={INVOICE_STATUS[invoice.status]} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {invoice.payment_method ? PAYMENT_METHOD_LABEL[invoice.payment_method] : "—"}
                        {invoice.paid_at && (
                          <span className="block text-[11.5px] text-muted-foreground/80">{formatInstantDate(invoice.paid_at)}</span>
                        )}
                      </TableCell>
                      {manageInvoices && (
                        <TableCell>
                          {invoice.status !== "VOID" && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${invoice.invoice_number}`}>
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                {invoice.status === "DUE" && (
                                  <DropdownMenuItem onSelect={() => setPaying(invoice)}>
                                    <CircleCheck aria-hidden />
                                    Mark as paid
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onSelect={() => setEditing(invoice)}>
                                  <Pencil aria-hidden />
                                  Edit invoice
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onSelect={() => setVoiding(invoice)}>
                                  <Ban aria-hidden />
                                  Void invoice
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      )}
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
              onPageChange={(page) => params.set({ page: page > 1 ? page : undefined })}
            />
          </>
        )}
      </Panel>

      {manageInvoices && (
        <>
          <InvoiceFormDialog open={creating} onOpenChange={setCreating} />
          <InvoiceFormDialog
            open={Boolean(editing)}
            onOpenChange={(open) => !open && setEditing(null)}
            invoice={editing ?? undefined}
          />
          <MarkPaidDialog invoice={paying} onOpenChange={(open) => !open && setPaying(null)} />
          <ConfirmDialog
            open={Boolean(voiding)}
            onOpenChange={(open) => !open && setVoiding(null)}
            title="Void this invoice?"
            description="The invoice will remain in billing history and will no longer count toward collected revenue. Voided invoices can't be edited."
            confirmLabel="Void invoice"
            cancelLabel="Keep invoice"
            destructive
            pending={voidMutation.isPending}
            onConfirm={() => voiding && voidMutation.mutate(voiding)}
          />
        </>
      )}
    </>
  );
}
