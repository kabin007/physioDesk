import type { Invoice, InvoiceCreate, InvoiceStatus, InvoiceUpdate, Page } from "@/types/api";

import { api } from "./client";

export interface InvoiceFilters {
  page: number;
  page_size?: number;
  status?: InvoiceStatus;
  patient_id?: string;
  search?: string;
}

export const listInvoices = (filters: InvoiceFilters) =>
  api<Page<Invoice>>("/invoices", { params: { ...filters } });

export const createInvoice = (body: InvoiceCreate) =>
  api<Invoice>("/invoices", { method: "POST", body });

export const updateInvoice = (id: string, body: InvoiceUpdate) =>
  api<Invoice>(`/invoices/${id}`, { method: "PATCH", body });

/** DELETE voids the invoice: it stays in billing history and stops counting as revenue. */
export const voidInvoice = (id: string) => api<void>(`/invoices/${id}`, { method: "DELETE" });
