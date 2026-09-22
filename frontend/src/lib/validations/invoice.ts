import { z } from "zod";

import { toCents } from "@/lib/format";
import type { Invoice } from "@/types/api";

const amount = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter an amount such as 1500 or 1500.50");

// Mirrors the API's rules for UX; the backend still validates and computes the total.
export const invoiceSchema = z
  .object({
    service: z
      .string()
      .trim()
      .min(1, "Describe the service")
      .max(200, "Keep it under 200 characters"),
    subtotal: amount,
    discount: amount,
    status: z.enum(["DUE", "PAID"]),
    payment_method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "OTHER"]).optional(),
  })
  .superRefine((values, ctx) => {
    const subtotal = toCents(values.subtotal);
    const discount = toCents(values.discount);
    if (subtotal !== null && discount !== null && discount > subtotal) {
      ctx.addIssue({
        code: "custom",
        path: ["discount"],
        message: "Discount can't exceed the subtotal",
      });
    }
    if (values.status === "PAID" && !values.payment_method) {
      ctx.addIssue({ code: "custom", path: ["payment_method"], message: "Choose how it was paid" });
    }
  });

export type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export function invoiceDefaults(invoice?: Invoice): InvoiceFormValues {
  return {
    service: invoice?.service ?? "",
    subtotal: invoice?.subtotal ?? "",
    discount: invoice?.discount ?? "0",
    status: invoice?.status === "PAID" ? "PAID" : "DUE",
    payment_method: invoice?.payment_method ?? undefined,
  };
}
