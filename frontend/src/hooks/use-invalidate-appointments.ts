"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { queryKeys } from "@/lib/query/keys";

/**
 * After any appointment change: the schedule grid, dashboard capacity and "patients seen",
 * appointment lists, patient history/stats and the therapist roster's "patients today"
 * can all be affected.
 */
export function useInvalidateAppointments() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    for (const queryKey of [
      queryKeys.schedule.all,
      queryKeys.dashboard,
      queryKeys.appointments.all,
      queryKeys.patients.all,
      queryKeys.therapists.list,
    ]) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient]);
}
