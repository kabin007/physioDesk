"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { errorMessage } from "@/lib/api/errors";
import { updateInvoice } from "@/lib/api/invoices";
import { formatMoney } from "@/lib/format";
import { enumOptions, PAYMENT_METHOD_LABEL } from "@/lib/labels";
import type { Invoice, PaymentMethod } from "@/types/api";

import { useInvalidateBilling } from "./use-invalidate-billing";

export function MarkPaidDialog({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(invoice)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        {invoice && <MarkPaidForm invoice={invoice} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidForm({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const invalidate = useInvalidateBilling();
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const pay = useMutation({
    mutationFn: () => updateInvoice(invoice.id, { status: "PAID", payment_method: method }),
    onSuccess: () => {
      invalidate();
      toast.success("Invoice marked as paid", { description: invoice.invoice_number });
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mark as paid</DialogTitle>
        <DialogDescription>
          <span className="font-mono">{invoice.invoice_number}</span> · {invoice.patient.full_name}{" "}
          · <span className="font-mono">{formatMoney(invoice.total)}</span>
        </DialogDescription>
      </DialogHeader>
      <FormField id="paid-method" label="Payment method">
        <ToggleGroup
          id="paid-method"
          type="single"
          variant="outline"
          value={method}
          onValueChange={(value) => value && setMethod(value as PaymentMethod)}
          className="grid w-full grid-cols-2"
        >
          {enumOptions(PAYMENT_METHOD_LABEL).map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FormField>
      <p className="text-xs text-muted-foreground">
        The payment is recorded now and counts toward today&apos;s revenue.
      </p>
      <DialogFooter>
        <Button variant="secondary" onClick={onDone} disabled={pay.isPending}>
          Cancel
        </Button>
        <Button onClick={() => pay.mutate()} disabled={pay.isPending}>
          {pay.isPending ? "Saving…" : "Mark as paid"}
        </Button>
      </DialogFooter>
    </>
  );
}
