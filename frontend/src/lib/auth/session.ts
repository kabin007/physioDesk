"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import * as authApi from "@/lib/api/auth";
import { queryKeys } from "@/lib/query/keys";
import type { User, UserRole } from "@/types/api";

/**
 * Role permissions, mirroring the backend (which remains authoritative):
 * both roles have full access to patients and appointments and can read everything;
 * only ADMIN can mutate therapists, schedule overrides and invoices.
 */
export interface Permissions {
  manageTherapists: boolean;
  manageInvoices: boolean;
}

export function permissionsFor(role: UserRole | undefined): Permissions {
  const isAdmin = role === "ADMIN";
  return { manageTherapists: isAdmin, manageInvoices: isAdmin };
}

export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: authApi.getSession,
    staleTime: 5 * 60_000,
  });
}

export function useCurrentUser(): User | undefined {
  return useSession().data;
}

export function usePermissions(): Permissions {
  return permissionsFor(useSession().data?.role);
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      // Drop every cached response so the next user starts clean.
      queryClient.clear();
      router.replace("/login");
    },
  });
}
