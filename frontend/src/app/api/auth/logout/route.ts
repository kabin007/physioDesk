import { NextResponse, type NextRequest } from "next/server";

import { authorizedFetch, clearSessionCookies } from "@/lib/server/backend";

/**
 * Revoke the user's tokens in FastAPI (which invalidates every session of that user) and
 * clear our cookies. Cookies are cleared even if the backend call fails.
 */
export async function POST(request: NextRequest) {
  try {
    await authorizedFetch(request, "/auth/logout", { method: "POST" });
  } catch {
    // Backend unreachable: still end the local session.
  }
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookies(response);
  return response;
}
