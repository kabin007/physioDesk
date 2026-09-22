/**
 * Human-readable labels for API enums. Raw enum values are never shown in the UI.
 */
import type {
  AppointmentStatus,
  AvailabilitySource,
  Gender,
  InvoiceStatus,
  PatientStatus,
  PaymentMethod,
  SessionType,
} from "@/types/api";

export type Tone = "success" | "danger" | "neutral";
/** A glyph accompanies every status so meaning never relies on colour alone. */
export type StatusIcon = "dot" | "check" | "pause" | "clock" | "x" | "ban";

interface StatusMeta {
  label: string;
  tone: Tone;
  icon: StatusIcon;
}

// Status colours follow the design system: success = active/paid/booked,
// danger = cancelled/void, neutral ("neutral/info") = pending/on hold/completed.
export const PATIENT_STATUS: Record<PatientStatus, StatusMeta> = {
  ACTIVE: { label: "Active", tone: "success", icon: "dot" },
  COMPLETED: { label: "Completed", tone: "neutral", icon: "check" },
  ON_HOLD: { label: "On hold", tone: "neutral", icon: "pause" },
};

export const APPOINTMENT_STATUS: Record<AppointmentStatus, StatusMeta> = {
  BOOKED: { label: "Booked", tone: "success", icon: "dot" },
  COMPLETED: { label: "Completed", tone: "neutral", icon: "check" },
  CANCELLED: { label: "Cancelled", tone: "danger", icon: "x" },
};

export const INVOICE_STATUS: Record<InvoiceStatus, StatusMeta> = {
  PAID: { label: "Paid", tone: "success", icon: "check" },
  DUE: { label: "Due", tone: "neutral", icon: "clock" },
  VOID: { label: "Void", tone: "danger", icon: "ban" },
};

export const THERAPIST_STATUS: Record<"ACTIVE" | "INACTIVE", StatusMeta> = {
  ACTIVE: { label: "Active", tone: "success", icon: "dot" },
  INACTIVE: { label: "Inactive", tone: "neutral", icon: "pause" },
};

export const GENDER_LABEL: Record<Gender, string> = {
  FEMALE: "Female",
  MALE: "Male",
  OTHER: "Other",
};

export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  ASSESSMENT: "Assessment",
  TREATMENT: "Treatment",
  FOLLOW_UP: "Follow-up",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};

export const AVAILABILITY_LABEL: Record<AvailabilitySource, string> = {
  REGULAR: "Regular hours",
  OVERRIDE_HOURS: "Custom hours",
  OVERRIDE_DAY_OFF: "Day off",
  NON_WORKING_DAY: "Not working",
  INACTIVE: "Inactive",
};

/** ISO weekday (1 = Monday ... 7 = Sunday), as used by the API. */
export const WEEKDAYS: { value: number; short: string; long: string }[] = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 7, short: "Sun", long: "Sunday" },
];

export function enumOptions<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

export function statusOptions<T extends string>(meta: Record<T, StatusMeta>) {
  return (Object.keys(meta) as T[]).map((value) => ({ value, label: meta[value].label }));
}
