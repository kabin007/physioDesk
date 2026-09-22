import type { Schedule } from "@/types/api";

import { api } from "./client";

/** Slot grid for a clinic-local date (null = the clinic's today, decided by the backend). */
export const getSchedule = (date: string | null, therapistId?: string) =>
  api<Schedule>("/schedule", { params: { date, therapist_id: therapistId } });
