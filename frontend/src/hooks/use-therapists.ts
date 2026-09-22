"use client";

import { useQuery } from "@tanstack/react-query";

import { listTherapists } from "@/lib/api/therapists";
import { queryKeys } from "@/lib/query/keys";

/** The therapist roster (small, cached, shared by filters and forms). */
export function useTherapists() {
  return useQuery({ queryKey: queryKeys.therapists.list, queryFn: listTherapists });
}

export function useTherapistOptions({ activeOnly = false } = {}) {
  const { data = [] } = useTherapists();
  return data
    .filter((therapist) => !activeOnly || therapist.is_active)
    .map((therapist) => ({ value: therapist.id, label: therapist.name }));
}
