/**
 * Friendly aliases over the types generated from the FastAPI OpenAPI schema
 * (`npm run gen:api`). Never hand-edit shapes here: regenerate instead.
 */
import type { components } from "./api.gen";

type Schemas = components["schemas"];

// Enums
export type UserRole = Schemas["UserRole"];
export type Gender = Schemas["Gender"];
export type PatientStatus = Schemas["PatientStatus"];
export type AppointmentStatus = Schemas["AppointmentStatus"];
export type SessionType = Schemas["SessionType"];
export type PaymentMethod = Schemas["PaymentMethod"];
export type InvoiceStatus = Schemas["InvoiceStatus"];
export type SlotStatus = Schemas["SlotStatus"];
export type AvailabilitySource = Schemas["AvailabilitySource"];

// Auth
export type User = Schemas["UserRead"];
export type LoginRequest = Schemas["LoginRequest"];

// Dashboard
export type Dashboard = Schemas["DashboardRead"];
export type TherapistCapacity = Schemas["TherapistCapacity"];
export type RecentPatient = Schemas["RecentPatient"];

// Patients
export type Patient = Schemas["PatientRead"];
export type PatientDetail = Schemas["PatientDetail"];
export type PatientStats = Schemas["PatientStats"];
export type PatientCreate = Schemas["PatientCreate"];
export type PatientUpdate = Schemas["PatientUpdate"];
export type PatientSummary = Schemas["PatientSummary"];

// Therapists & schedule
export type Therapist = Schemas["TherapistRead"];
export type TherapistListItem = Schemas["TherapistListItem"];
export type TherapistSummary = Schemas["TherapistSummary"];
export type TherapistCreate = Schemas["TherapistCreate"];
export type TherapistUpdate = Schemas["TherapistUpdate"];
export type ScheduleOverride = Schemas["ScheduleOverrideRead"];
export type ScheduleOverrideCreate = Schemas["ScheduleOverrideCreate"];
export type ScheduleOverrideUpdate = Schemas["ScheduleOverrideUpdate"];
export type Schedule = Schemas["ScheduleRead"];
export type TherapistSchedule = Schemas["TherapistScheduleRead"];
export type ScheduleSlot = Schemas["ScheduleSlotRead"];

// Appointments
export type Appointment = Schemas["AppointmentRead"];
export type AppointmentCreate = Schemas["AppointmentCreate"];
export type AppointmentUpdate = Schemas["AppointmentUpdate"];

// Invoices
export type Invoice = Schemas["InvoiceRead"];
export type InvoiceCreate = Schemas["InvoiceCreate"];
export type InvoiceUpdate = Schemas["InvoiceUpdate"];

// Pagination (matches app.schemas.common.Page)
export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  pages: number;
}
