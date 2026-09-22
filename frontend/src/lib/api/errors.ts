/**
 * Normalises every failure (FastAPI domain errors, 422 validation errors, network errors)
 * into one `ApiError` shape the UI can rely on.
 *
 * FastAPI bodies:
 *   domain error:     {"detail": {"code": "APPOINTMENT_CONFLICT", "message": "..."}}
 *   validation error: {"detail": [{"loc": ["body", "age"], "msg": "...", "type": "..."}]}
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Field name -> message, from 422 validation errors. */
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, code: string, message: string, fieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  get isConflict() {
    return this.status === 409;
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  0: "Can't reach the server. Check your connection and try again.",
  400: "The request couldn't be completed.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  409: "This conflicts with existing data.",
  422: "Some fields need attention.",
};

interface ValidationIssue {
  loc?: (string | number)[];
  msg?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanMessage(message: string): string {
  // Pydantic prefixes custom validator messages with "Value error, ".
  const text = message.replace(/^Value error, /, "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function toApiError(status: number, body: unknown): ApiError {
  const detail = isRecord(body) ? body.detail : undefined;

  if (isRecord(detail) && typeof detail.code === "string") {
    const message = typeof detail.message === "string" ? detail.message : "";
    return new ApiError(status, detail.code, message || fallbackMessage(status));
  }

  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {};
    const general: string[] = [];
    for (const issue of detail as ValidationIssue[]) {
      const loc = (issue.loc ?? []).filter((part) => part !== "body" && part !== "query");
      const message = cleanMessage(issue.msg ?? "Invalid value");
      const field = loc.find((part): part is string => typeof part === "string");
      if (field && !(field in fieldErrors)) fieldErrors[field] = message;
      else if (!field) general.push(message);
    }
    return new ApiError(
      status,
      "VALIDATION_ERROR",
      general[0] ?? fallbackMessage(422),
      fieldErrors,
    );
  }

  return new ApiError(status, status >= 500 ? "SERVER_ERROR" : "ERROR", fallbackMessage(status));
}

export function fallbackMessage(status: number): string {
  return (
    FALLBACK_MESSAGES[status] ??
    (status >= 500 ? "Something went wrong on our side. Please try again." : "Request failed.")
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return fallbackMessage(500);
}
