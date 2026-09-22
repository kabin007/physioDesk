import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { ApiError } from "@/lib/api/errors";

/**
 * Copy FastAPI 422 field errors onto the matching form fields. Returns true when at least
 * one error was attached to a field (so the caller can skip a generic toast).
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): boolean {
  if (!(error instanceof ApiError)) return false;
  let applied = false;
  for (const [field, message] of Object.entries(error.fieldErrors)) {
    if (fields.includes(field)) {
      setError(field as Path<T>, { type: "server", message });
      applied = true;
    }
  }
  return applied;
}
