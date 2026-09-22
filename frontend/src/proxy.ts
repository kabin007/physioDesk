import { NextResponse, type NextRequest } from "next/server";

// Kept in sync with lib/server/backend.ts (that module is server-only and heavier).
const REFRESH_COOKIE = "pd_refresh";

/**
 * Optimistic route protection: pages require a session cookie, and /login is skipped when
 * one exists. The real check happens on every API call (FastAPI validates the JWT); an
 * expired or revoked session is detected there, its cookies are cleared, and the client
 * is sent to /login.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(REFRESH_COOKIE);

  if (pathname === "/login") {
    return hasSession ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (!hasSession) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)"],
};
