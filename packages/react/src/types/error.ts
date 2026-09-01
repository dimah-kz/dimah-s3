import { APIError, isAPIError } from "@dimah-s3/core";
import type { UploadPhase } from "./upload";

/**
 * Client-side upload failure (XHR to S3 / unexpected throw).
 *
 * Protocol errors from `S3Api` stay {@link APIError} — do not wrap them
 * or the stable `code` is lost for i18n.
 */
export class S3UploadError extends APIError {
  readonly phase: UploadPhase | undefined;

  constructor(
    message: string,
    code: string,
    status = 400,
    phase?: UploadPhase,
  ) {
    super(status, { message, code });
    this.name = "S3UploadError";
    this.phase = phase;
  }
}

/**
 * Normalize unknown throws for the upload engine.
 * Preserves AbortError and {@link APIError}; wraps everything else.
 */
export function toUploadError(err: unknown, phase?: UploadPhase): APIError {
  if (err instanceof S3UploadError) {
    if (phase != null && err.phase == null) {
      return new S3UploadError(
        err.message,
        err.code ?? "UPLOAD_ERROR",
        err.statusCode,
        phase,
      );
    }
    return err;
  }

  if (isAbortError(err)) {
    throw err;
  }

  if (isAPIError(err)) return err;

  const message = err instanceof Error ? err.message : "Upload failed";
  return new S3UploadError(message, "UPLOAD_ERROR", 500, phase);
}

/** Normalize unknown throws for hook `error` state. */
export function toHookError(
  err: unknown,
  fallback = "Request failed",
): APIError {
  if (isAPIError(err)) return err;
  const message = err instanceof Error ? err.message : fallback;
  return new APIError("BAD_REQUEST", { message });
}

export function isAbortError(err: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      err instanceof DOMException &&
      err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError") ||
    (typeof err === "object" &&
      err !== null &&
      (err as { name?: string }).name === "AbortError")
  );
}

/** Client-side block from a `before*` hook (`false` return). */
export function hookBlockedError(message: string): APIError {
  return new APIError("BAD_REQUEST", { message });
}
