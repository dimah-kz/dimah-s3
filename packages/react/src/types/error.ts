import { DimahS3Error } from "@dimah-s3/core";
import type { UploadPhase } from "./upload";

/**
 * Structured error thrown by the upload engine.
 *
 * Extends {@link DimahS3Error} so HTTP status aligns with server/client fetcher.
 *
 * - `code` — machine-readable (e.g. `"HTTP_ERROR"`, `"NETWORK_ERROR"`)
 * - `status` / `statusCode` — HTTP status when known
 * - `phase` — upload phase in which the error occurred
 */
export class S3UploadError extends DimahS3Error {
  readonly code: string;
  readonly phase: UploadPhase | undefined;

  constructor(
    message: string,
    code: string,
    status = 400,
    phase?: UploadPhase,
  ) {
    super(message, status);
    this.name = "S3UploadError";
    this.code = code;
    this.phase = phase;
  }

  /** Alias for {@link DimahS3Error.status}. */
  get statusCode(): number {
    return this.status;
  }
}

/**
 * Normalize unknown throws into {@link S3UploadError}.
 * Preserves AbortError; wraps {@link DimahS3Error} and plain Errors.
 */
export function toUploadError(
  err: unknown,
  phase?: UploadPhase,
): S3UploadError {
  if (err instanceof S3UploadError) {
    if (phase != null && err.phase == null) {
      return new S3UploadError(err.message, err.code, err.status, phase);
    }
    return err;
  }

  if ((err as { name?: string })?.name === "AbortError") {
    throw err;
  }

  if (err instanceof DimahS3Error) {
    return new S3UploadError(err.message, "API_ERROR", err.status, phase);
  }

  const message = err instanceof Error ? err.message : "Upload failed";
  return new S3UploadError(message, "UPLOAD_ERROR", 500, phase);
}
