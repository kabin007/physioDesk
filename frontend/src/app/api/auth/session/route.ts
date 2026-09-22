import { NextResponse, type NextRequest } from "next/server";

import { applySession, authorizedFetch, backendUnavailable } from "@/lib/server/backend";

/** The signed-in user (refreshing the access token if needed), or 401. */
export async function GET(request: NextRequest) {
  try {
    const result = await authorizedFetch(request, "/auth/me");
    const response = NextResponse.json(await result.response.json(), {
      status: result.response.status,
    });
    return applySession(response, result);
  } catch {
    return backendUnavailable();
  }
}
