import { z } from "zod";

export const bookingSchema = z.object({
  patient_id: z.string().min(1, "Choose a patient"),
  therapist_id: z.string().min(1, "Choose a therapist"),
  appointment_date: z.string().min(1, "Choose a date"),
  start_time: z.string().min(1, "Choose an available time"),
  payment_method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "OTHER"], {
    error: "Choose a payment method",
  }),
  session_type: z.enum(["ASSESSMENT", "TREATMENT", "FOLLOW_UP"]),
  notes: z.string().trim().max(2000, "Keep notes under 2000 characters"),
});

export type BookingValues = z.infer<typeof bookingSchema>;

export const rescheduleSchema = bookingSchema.pick({
  therapist_id: true,
  appointment_date: true,
  start_time: true,
});

export type RescheduleValues = z.infer<typeof rescheduleSchema>;

/** Friendly copy for booking failures the API reports (codes from the FastAPI backend). */
export const BOOKING_CONFLICT_MESSAGES: Record<string, string> = {
  APPOINTMENT_CONFLICT: "That time was just booked by another user. Please choose another available slot.",
  PATIENT_APPOINTMENT_CONFLICT:
    "This patient already has another appointment at that time. Please choose a different slot.",
};
