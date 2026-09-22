import { ApiError, toApiError } from "./errors";

/**
 * The only place the browser performs HTTP. Requests go to our BFF (/api/backend/...),
 * which attaches the session and forwards to FastAPI.
 */

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  params?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
}

function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function redirectToLogin() {
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  const next = window.location.pathname + window.location.search;
  // A full page load (not client routing) so no cached data of the old session survives.
  window.location.replace(`${window.location.origin}/login?next=${encodeURIComponent(next)}`);
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url + buildQuery(options.params), {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw toApiError(0, null);
  }

  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = toApiError(response.status, data);
    // The BFF only answers 401 once the session is truly over (refresh already failed).
    if (response.status === 401) redirectToLogin();
    throw error;
  }
  return data as T;
}

/** Call a FastAPI endpoint (path relative to /api/v1) through the BFF. */
export function api<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>(`/api/backend${path}`, options);
}

export { ApiError };
