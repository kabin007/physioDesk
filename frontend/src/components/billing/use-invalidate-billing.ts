"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { queryKeys } from "@/lib/query/keys";

/** Invoices feed the billing list, patient billing history/balances and today's revenue. */
export function useInvalidateBilling() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  }, [queryClient]);
}
