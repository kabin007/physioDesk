import { NextResponse } from "next/server";

import {
  backendUnavailable,
  backendUrl,
  setSessionCookies,
  type TokenPair,
} from "@/lib/server/backend";

export async function POST(request: Request) {
  try {
    const login = await fetch(backendUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
    if (!login.ok) {
      // Forward FastAPI's error (401 invalid credentials, 422 validation) unchanged.
      return new NextResponse(await login.text(), {
        status: login.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const tokens = (await login.json()) as TokenPair;
    const me = await fetch(backendUrl("/auth/me"), {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });

    const response = NextResponse.json(await me.json(), { status: me.status });
    if (me.ok) setSessionCookies(response, tokens);
    return response;
  } catch {
    return backendUnavailable();
  }
}
