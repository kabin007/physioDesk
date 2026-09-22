"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { PatientCombobox } from "@/components/schedule/patient-combobox";
import { fieldAria, FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { errorMessage } from "@/lib/api/errors";
import { createInvoice, updateInvoice } from "@/lib/api/invoices";
import { centsToString, CURRENCY, formatMoney, toCents } from "@/lib/format";
import { applyServerFieldErrors } from "@/lib/forms";
import { enumOptions, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { invoiceDefaults, invoiceSchema, type InvoiceFormValues } from "@/lib/validations/invoice";
import type { Invoice, PatientSummary } from "@/types/api";

import { useInvalidateBilling } from "./use-invalidate-billing";

interface InvoiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this invoice; omit to create one. */
  invoice?: Invoice;
}

export function InvoiceFormDialog({ open, onOpenChange, invoice }: InvoiceFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <InvoiceForm invoice={invoice} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function InvoiceForm({ invoice, onDone }: { invoice?: Invoice; onDone: () => void }) {
  const invalidate = useInvalidateBilling();
  const [patient, setPatient] = useState<PatientSummary | null>(invoice?.patient ?? null);
  const [patientError, setPatientError] = useState<string | null>(null);
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: invoiceDefaults(invoice),
  });
  const { errors } = form.formState;
  const [subtotal, discount, status] = useWatch({
    control: form.control,
    name: ["subtotal", "discount", "status"],
  });

  const save = useMutation({
    mutationFn: (values: InvoiceFormValues) => {
      const body = {
        service: values.service,
        subtotal: values.subtotal,
        discount: values.discount,
        status: values.status,
        payment_method: values.status === "PAID" ? (values.payment_method ?? null) : null,
      };
      return invoice
        ? updateInvoice(invoice.id, body)
        : createInvoice({ ...body, patient_id: patient!.id });
    },
    onSuccess: (saved) => {
      invalidate();
      toast.success(invoice ? "Invoice updated" : "Invoice created", {
        description: `${saved.invoice_number} · ${formatMoney(saved.total)}`,
      });
      onDone();
    },
    onError: (error, values) => {
      if (!applyServerFieldErrors(error, form.setError, Object.keys(values)))
        toast.error(errorMessage(error));
    },
  });

  // Preview only: integer cents, no floating point. The server computes the real total.
  const subtotalCents = toCents(subtotal ?? "");
  const discountCents = toCents(discount ?? "") ?? BigInt(0);
  const total =
    subtotalCents !== null && discountCents <= subtotalCents ? subtotalCents - discountCents : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{invoice ? `Edit ${invoice.invoice_number}` : "Create invoice"}</DialogTitle>
        <DialogDescription>
          {invoice
            ? `Billed to ${invoice.patient.full_name}.`
            : "Bill a patient for a service or package."}
        </DialogDescription>
      </DialogHeader>

      <form
        id="invoice-form"
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => {
          if (!invoice && !patient) {
            setPatientError("Choose a patient");
            return;
          }
          save.mutate(values);
        })}
      >
        {!invoice && (
          <FormField id="invoice-patient" label="Patient" error={patientError ?? undefined}>
            <PatientCombobox
              id="invoice-patient"
              value={patient}
              invalid={Boolean(patientError)}
              onChange={(selected) => {
                setPatient(selected);
                setPatientError(null);
              }}
            />
          </FormField>
        )}
        <FormField id="service" label="Service" error={errors.service?.message}>
          <Input
            {...fieldAria("service", errors.service?.message)}
            placeholder="e.g. Physiotherapy session, 10-session package"
            {...form.register("service")}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="subtotal"
            label={`Subtotal (${CURRENCY})`}
            error={errors.subtotal?.message}
          >
            <Input
              {...fieldAria("subtotal", errors.subtotal?.message)}
              inputMode="decimal"
              placeholder="0.00"
              className="font-mono"
              {...form.register("subtotal")}
            />
          </FormField>
          <FormField
            id="discount"
            label={`Discount (${CURRENCY})`}
            error={errors.discount?.message}
          >
            <Input
              {...fieldAria("discount", errors.discount?.message)}
              inputMode="decimal"
              placeholder="0.00"
              className="font-mono"
              {...form.register("discount")}
            />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="invoice-status" label="Status">
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <ToggleGroup
                  id="invoice-status"
                  type="single"
                  variant="outline"
                  value={field.value}
                  onValueChange={(value) => value && field.onChange(value)}
                  className="w-full"
                >
                  <ToggleGroupItem value="DUE" className="flex-1">
                    Due
                  </ToggleGroupItem>
                  <ToggleGroupItem value="PAID" className="flex-1">
                    Paid
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
            />
          </FormField>
          {status === "PAID" && (
            <FormField
              id="payment_method"
              label="Payment method"
              error={errors.payment_method?.message}
            >
              <Controller
                control={form.control}
                name="payment_method"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger
                      {...fieldAria("payment_method", errors.payment_method?.message)}
                      className="w-full"
                    >
                      <SelectValue placeholder="How was it paid?" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {enumOptions(PAYMENT_METHOD_LABEL).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          )}
        </div>

        <dl className="space-y-1.5 rounded-lg border border-border bg-background px-4 py-3 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="font-mono">
              {subtotalCents !== null ? formatMoney(centsToString(subtotalCents)) : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Discount</dt>
            <dd className="font-mono">− {formatMoney(centsToString(discountCents))}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 text-sm font-medium">
            <dt>Total</dt>
            <dd className="font-mono">
              {total !== null ? formatMoney(centsToString(total)) : "—"}
            </dd>
          </div>
        </dl>
      </form>

      <DialogFooter>
        <Button variant="secondary" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" form="invoice-form" disabled={save.isPending}>
          {save.isPending ? "Saving…" : invoice ? "Save changes" : "Create invoice"}
        </Button>
      </DialogFooter>
    </>
  );
}
