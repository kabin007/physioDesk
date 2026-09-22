import "server-only";

import type { NextRequest, NextResponse } from "next/server";

/**
 * Backend-for-frontend (BFF) helpers.
 *
 * The browser never sees a JWT: both tokens live in httpOnly cookies set by our route
 * handlers, which attach the access token when forwarding to FastAPI and transparently
 * refresh it (once) when FastAPI answers 401.
 */

const API_URL = process.env.API_URL ?? "http://localhost:8000";
const API_PREFIX = process.env.API_PREFIX ?? "/api/v1";

export const ACCESS_COOKIE = "pd_access";
export const REFRESH_COOKIE = "pd_refresh";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
}

export function backendUrl(path: string, search = ""): string {
  return `${API_URL}${API_PREFIX}${path}${search}`;
}

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function setSessionCookies(response: NextResponse, tokens: TokenPair): void {
  response.cookies.set(ACCESS_COOKIE, tokens.access_token, {
    ...cookieBase,
    maxAge: tokens.expires_in,
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
    ...cookieBase,
    maxAge: tokens.refresh_expires_in,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_COOKIE, "", { ...cookieBase, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

async function refreshTokens(refreshToken: string): Promise<TokenPair | null> {
  try {
    const response = await fetch(backendUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    return response.ok ? ((await response.json()) as TokenPair) : null;
  } catch {
    return null;
  }
}

export interface AuthorizedResult {
  response: Response;
  /** New tokens obtained by a refresh during this call; must be written to cookies. */
  refreshed: TokenPair | null;
  /** The session is no longer valid; cookies must be cleared. */
  sessionEnded: boolean;
}

/**
 * Call FastAPI as the current user. Refreshes the access token once if it is missing or
 * rejected, so callers only ever see a 401 when the session has truly ended.
 */
export async function authorizedFetch(
  request: NextRequest,
  path: string,
  init: { method?: string; body?: string; contentType?: string | null; search?: string } = {},
): Promise<AuthorizedResult> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  let accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  let refreshed: TokenPair | null = null;

  if (!accessToken && refreshToken) {
    refreshed = await refreshTokens(refreshToken);
    accessToken = refreshed?.access_token;
  }
  if (!accessToken) {
    return { response: unauthenticated(), refreshed: null, sessionEnded: true };
  }

  const send = (token: string) =>
    fetch(backendUrl(path, init.search), {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.contentType ? { "Content-Type": init.contentType } : {}),
      },
      body: init.body,
      cache: "no-store",
    });

  let response = await send(accessToken);
  if (response.status === 401 && refreshToken && !refreshed) {
    refreshed = await refreshTokens(refreshToken);
    if (refreshed) response = await send(refreshed.access_token);
  }
  return { response, refreshed, sessionEnded: response.status === 401 };
}

export function applySession(response: NextResponse, result: AuthorizedResult): NextResponse {
  if (result.sessionEnded) clearSessionCookies(response);
  else if (result.refreshed) setSessionCookies(response, result.refreshed);
  return response;
}

function unauthenticated(): Response {
  return Response.json(
    { detail: { code: "NOT_AUTHENTICATED", message: "Please sign in." } },
    { status: 401 },
  );
}

export function backendUnavailable(): Response {
  return Response.json(
    {
      detail: {
        code: "BACKEND_UNAVAILABLE",
        message: "The PhysioDesk API is unreachable. Please try again shortly.",
      },
    },
    { status: 502 },
  );
}
