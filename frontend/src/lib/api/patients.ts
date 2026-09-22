import type {
  Appointment,
  Invoice,
  Page,
  Patient,
  PatientCreate,
  PatientDetail,
  PatientStatus,
  PatientUpdate,
} from "@/types/api";

import { api } from "./client";

export interface PatientFilters {
  page: number;
  page_size?: number;
  search?: string;
  therapist_id?: string;
  status?: PatientStatus;
}

export const listPatients = (filters: PatientFilters) =>
  api<Page<Patient>>("/patients", { params: { ...filters } });

export const getPatient = (id: string) => api<PatientDetail>(`/patients/${id}`);

export const createPatient = (body: PatientCreate) =>
  api<Patient>("/patients", { method: "POST", body });

export const updatePatient = (id: string, body: PatientUpdate) =>
  api<Patient>(`/patients/${id}`, { method: "PATCH", body });

export const deletePatient = (id: string) =>
  api<void>(`/patients/${id}`, { method: "DELETE" });

export const listPatientAppointments = (id: string, page: number, pageSize = 10) =>
  api<Page<Appointment>>(`/patients/${id}/appointments`, {
    params: { page, page_size: pageSize },
  });

export const listPatientInvoices = (id: string, page: number, pageSize = 10) =>
  api<Page<Invoice>>(`/patients/${id}/invoices`, { params: { page, page_size: pageSize } });
