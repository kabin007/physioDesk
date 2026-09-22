"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { queryKeys } from "@/lib/query/keys";

/** Therapist/schedule changes affect the roster, the schedule grid, dashboard capacity
 *  and patients' assigned-therapist names. */
export function useInvalidateTherapists() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    for (const queryKey of [queryKeys.therapists.all, queryKeys.schedule.all, queryKeys.dashboard, queryKeys.patients.all]) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient]);
}
