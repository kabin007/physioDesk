import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/errors";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Retry only transient failures; 4xx answers will not change on retry.
        retry: (failureCount, error) =>
          failureCount < 2 &&
          !(error instanceof ApiError && error.status > 0 && error.status < 500),
      },
      mutations: { retry: false },
    },
  });
}
