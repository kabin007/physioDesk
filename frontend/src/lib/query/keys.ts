/**
 * Centralised query keys. Keys are hierarchical so a mutation can invalidate a whole
 * family (e.g. every patient list) with its prefix.
 */
import type { AppointmentFilters } from "@/lib/api/appointments";
import type { InvoiceFilters } from "@/lib/api/invoices";
import type { PatientFilters } from "@/lib/api/patients";

export const queryKeys = {
  session: ["session"] as const,
  dashboard: ["dashboard"] as const,

  patients: {
    all: ["patients"] as const,
    list: (filters: PatientFilters) => ["patients", "list", filters] as const,
    detail: (id: string) => ["patients", "detail", id] as const,
    appointments: (id: string, page: number) => ["patients", id, "appointments", page] as const,
    invoices: (id: string, page: number) => ["patients", id, "invoices", page] as const,
  },

  therapists: {
    all: ["therapists"] as const,
    list: ["therapists", "list"] as const,
    detail: (id: string) => ["therapists", "detail", id] as const,
    overrides: (id: string) => ["therapists", id, "overrides"] as const,
  },

  schedule: {
    all: ["schedule"] as const,
    day: (date: string | null, therapistId?: string) =>
      ["schedule", date ?? "today", therapistId ?? "all"] as const,
  },

  appointments: {
    all: ["appointments"] as const,
    list: (filters: AppointmentFilters) => ["appointments", "list", filters] as const,
    detail: (id: string) => ["appointments", "detail", id] as const,
  },

  invoices: {
    all: ["invoices"] as const,
    list: (filters: InvoiceFilters) => ["invoices", "list", filters] as const,
  },
};
