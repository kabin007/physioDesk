import type {
  Appointment,
  AppointmentCreate,
  AppointmentStatus,
  AppointmentUpdate,
  Page,
} from "@/types/api";

import { api } from "./client";

export interface AppointmentFilters {
  page: number;
  page_size?: number;
  date?: string;
  therapist_id?: string;
  patient_id?: string;
  status?: AppointmentStatus;
}

export const listAppointments = (filters: AppointmentFilters) =>
  api<Page<Appointment>>("/appointments", { params: { ...filters } });

export const getAppointment = (id: string) => api<Appointment>(`/appointments/${id}`);

export const createAppointment = (body: AppointmentCreate) =>
  api<Appointment>("/appointments", { method: "POST", body });

export const updateAppointment = (id: string, body: AppointmentUpdate) =>
  api<Appointment>(`/appointments/${id}`, { method: "PATCH", body });

/** DELETE cancels the appointment (it stays in history). */
export const cancelAppointment = (id: string) =>
  api<void>(`/appointments/${id}`, { method: "DELETE" });
