import {
  DimahS3Error,
  isDimahS3Error,
  type DimahS3ErrorStatus,
} from "@dimah-s3/core";
import type { UploadPhase } from "./upload";

/**
 * Client-side upload failure (XHR to S3 / unexpected throw).
 *
 * Protocol errors from `S3Api` stay {@link DimahS3Error} — do not wrap them
 * or the stable `code` is lost for i18n.
 */
export class S3UploadError extends DimahS3Error {
  readonly phase: UploadPhase | undefined;

  constructor(
    message: string,
    code: string,
    status = 400,
    phase?: UploadPhase,
  ) {
    super(status as DimahS3ErrorStatus, { message, code });
    this.name = "S3UploadError";
    this.phase = phase;
  }
}

/**
 * Normalize unknown throws for the upload engine.
 * Preserves AbortError and {@link DimahS3Error}; wraps everything else.
 */
export function toUploadError(err: unknown, phase?: UploadPhase): DimahS3Error {
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

  if ((err as { name?: string })?.name === "AbortError") {
    throw err;
  }

  if (isDimahS3Error(err)) return err;

  const message = err instanceof Error ? err.message : "Upload failed";
  return new S3UploadError(message, "UPLOAD_ERROR", 500, phase);
}

/** Normalize unknown throws for hook `error` state. */
export function toHookError(
  err: unknown,
  fallback = "Request failed",
): DimahS3Error {
  if (isDimahS3Error(err)) return err;
  const message = err instanceof Error ? err.message : fallback;
  return new DimahS3Error("BAD_REQUEST", { message });
}

/** Client-side block from a `before*` hook (`false` return). */
export function hookBlockedError(message: string): DimahS3Error {
  return new DimahS3Error("BAD_REQUEST", { message });
}
