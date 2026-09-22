import { z } from "zod";

import type { PatientCreate, PatientDetail, Patient } from "@/types/api";

// Mirrors the backend's PatientCreate constraints; the API remains authoritative.
export const patientSchema = z.object({
  full_name: z.string().trim().min(1, "Enter the patient's name").max(120, "Keep it under 120 characters"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ()-]{5,18}$/, "Enter a valid phone number (7–20 digits)"),
  age: z
    .number({ error: "Enter an age" })
    .int("Age must be a whole number")
    .min(1, "Age must be at least 1")
    .max(130, "Age must be 130 or less"),
  gender: z.enum(["FEMALE", "MALE", "OTHER"], { error: "Choose a gender" }),
  address: z.string().trim().max(255, "Keep it under 255 characters"),
  condition: z.string().trim().min(1, "Describe the condition").max(255, "Keep it under 255 characters"),
  assigned_therapist_id: z.string(),
  package: z.string().trim().max(120, "Keep it under 120 characters"),
  status: z.enum(["ACTIVE", "COMPLETED", "ON_HOLD"]),
});

export type PatientFormValues = z.infer<typeof patientSchema>;

export const UNASSIGNED = "none";

export function patientDefaults(patient?: Patient | PatientDetail): Partial<PatientFormValues> {
  if (!patient) {
    return {
      full_name: "",
      phone: "",
      address: "",
      condition: "",
      assigned_therapist_id: UNASSIGNED,
      package: "",
      status: "ACTIVE",
    };
  }
  return {
    full_name: patient.full_name,
    phone: patient.phone,
    age: patient.age,
    gender: patient.gender,
    address: patient.address ?? "",
    condition: patient.condition,
    assigned_therapist_id: patient.assigned_therapist_id ?? UNASSIGNED,
    package: patient.package ?? "",
    status: patient.status,
  };
}

export function toPatientPayload(values: PatientFormValues): PatientCreate {
  return {
    ...values,
    address: values.address || null,
    package: values.package || null,
    assigned_therapist_id:
      values.assigned_therapist_id === UNASSIGNED ? null : values.assigned_therapist_id,
  };
}
