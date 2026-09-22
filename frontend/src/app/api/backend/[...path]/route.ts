import { NextResponse, type NextRequest } from "next/server";

import { applySession, authorizedFetch, backendUnavailable } from "@/lib/server/backend";

/**
 * Authenticated pass-through to FastAPI: /api/backend/<path> -> {API_URL}/api/v1/<path>.
 * Status codes and error bodies are forwarded unchanged so the client can interpret them.
 */
async function handler(request: NextRequest, ctx: RouteContext<"/api/backend/[...path]">) {
  const { path } = await ctx.params;
  // Token-issuing endpoints are handled by /api/auth/* so tokens never reach the browser.
  if (path[0] === "auth") {
    return NextResponse.json(
      { detail: { code: "NOT_FOUND", message: "Not found." } },
      { status: 404 },
    );
  }

  const hasBody = !["GET", "HEAD", "DELETE"].includes(request.method);
  try {
    const result = await authorizedFetch(request, "/" + path.map(encodeURIComponent).join("/"), {
      method: request.method,
      search: request.nextUrl.search,
      body: hasBody ? await request.text() : undefined,
      contentType: hasBody ? request.headers.get("content-type") : null,
    });
    const { response } = result;
    const body = response.status === 204 ? null : await response.text();
    const forwarded = new NextResponse(body, {
      status: response.status,
      headers: body
        ? { "Content-Type": response.headers.get("content-type") ?? "application/json" }
        : {},
    });
    return applySession(forwarded, result);
  } catch {
    return backendUnavailable();
  }
}

export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE };
