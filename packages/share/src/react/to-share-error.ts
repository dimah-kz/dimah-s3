import { isAPIError, s3Error, type APIError } from "@dimah-s3/core";

/**
 * A thrown value as an {@link APIError}: the client's own errors pass
 * through, anything else becomes `UNKNOWN_ERROR` with it as the `cause`.
 */
export function toShareError(error: unknown): APIError {
  if (isAPIError(error)) return error;
  return s3Error("UNKNOWN_ERROR", undefined, { cause: error });
}

/** True for the `DOMException` an aborted request rejects with. */
export function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}
