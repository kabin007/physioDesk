"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

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
  /** Known STAFF user: billing and therapists are read-only. */
  readOnlyAdminAreas: boolean;
}

export function permissionsFor(role: UserRole | undefined): Permissions {
  const isAdmin = role === "ADMIN";
  return {
    manageTherapists: isAdmin,
    manageInvoices: isAdmin,
    readOnlyAdminAreas: role === "STAFF",
  };
}

const subscribeNever = () => () => {};

/**
 * True after hydration. During hydration React uses the server snapshot (false), so
 * session-dependent UI renders identically on the server and in the first client pass,
 * even for Suspense boundaries that hydrate after the session query has resolved.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

export interface Session {
  user: User | undefined;
  isPending: boolean;
  /** The session request settled in failure (typically an unreachable API). */
  isError: boolean;
  retry: () => void;
}

export function useSession(): Session {
  const hydrated = useHydrated();
  const query = useQuery({
    queryKey: queryKeys.session,
    queryFn: authApi.getSession,
    staleTime: 5 * 60_000,
  });
  return {
    user: hydrated ? query.data : undefined,
    isPending: !hydrated || query.isPending,
    // The sidebar never unmounts, so a failed session query would otherwise stay
    // stuck on its loading state for the rest of the visit. Surface the failure
    // instead, and let the user retry it.
    isError: hydrated && query.isError,
    retry: () => void query.refetch(),
  };
}

export function usePermissions(): Permissions {
  return permissionsFor(useSession().user?.role);
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
