import { DimahS3Error, S3_ERROR_CODES, type S3ErrorCode } from "@dimah-s3/core";

export { DimahS3Error };

/** English API errors with stable codes for client-side localization. */
export const errors = {
  notFound: () =>
    new DimahS3Error("Not Found", 404, { code: S3_ERROR_CODES.NOT_FOUND }),

  invalidJson: () =>
    new DimahS3Error("Invalid JSON payload", 400, {
      code: S3_ERROR_CODES.INVALID_JSON,
    }),

  forbidden: () =>
    new DimahS3Error("Forbidden", 403, { code: S3_ERROR_CODES.FORBIDDEN }),

  internalError: () =>
    new DimahS3Error("Internal server error", 500, {
      code: S3_ERROR_CODES.INTERNAL_ERROR,
    }),

  objectNotFound: () =>
    new DimahS3Error("Object not found", 404, {
      code: S3_ERROR_CODES.OBJECT_NOT_FOUND,
    }),

  s3NetworkError: (code: string) =>
    new DimahS3Error(
      `S3 endpoint unreachable (${code}): check your endpoint URL and network connectivity`,
      502,
      { code: S3_ERROR_CODES.S3_NETWORK_ERROR, params: { code } },
    ),

  fieldRequired: (name: string) =>
    new DimahS3Error(`${name} is required`, 400, {
      code: S3_ERROR_CODES.FIELD_REQUIRED,
      params: { name },
    }),

  /** Missing `key` on query-string routes (download / delete / list-parts). */
  keyRequired: () =>
    new DimahS3Error("key query parameter is required", 400, {
      code: S3_ERROR_CODES.KEY_REQUIRED,
    }),

  uploadIdRequired: () =>
    new DimahS3Error("uploadId is required", 400, {
      code: S3_ERROR_CODES.UPLOAD_ID_REQUIRED,
    }),

  partNumberInvalid: () =>
    new DimahS3Error("partNumber must be a positive integer", 400, {
      code: S3_ERROR_CODES.PART_NUMBER_INVALID,
    }),

  partsRequired: () =>
    new DimahS3Error("At least one valid part is required", 400, {
      code: S3_ERROR_CODES.PARTS_REQUIRED,
    }),

  fileSizeRequiredUpload: () =>
    new DimahS3Error(
      "fileSize is required when upload.requireFileSize is enabled",
      400,
      { code: S3_ERROR_CODES.FILE_SIZE_REQUIRED_UPLOAD },
    ),

  fileSizeRequiredMultipart: () =>
    new DimahS3Error(
      "fileSize is required when multipart.requireFileSize is enabled",
      400,
      { code: S3_ERROR_CODES.FILE_SIZE_REQUIRED_MULTIPART },
    ),

  validationError: (message: string) =>
    new DimahS3Error(message, 400, {
      code: S3_ERROR_CODES.VALIDATION_ERROR,
    }),
} as const;

export type ServerErrors = typeof errors;

function statusOf(err: unknown, fallback: number): number {
  return typeof (err as { status?: unknown })?.status === "number"
    ? (err as { status: number }).status
    : fallback;
}

/**
 * Convert hook/S3 throws into {@link DimahS3Error}.
 *
 * - Existing {@link DimahS3Error} instances are preserved (including subclasses).
 * - Plain `Error`s keep their message; `code` is only applied when provided
 *   (omit it so clients show the custom English message instead of a mapped
 *   library string).
 */
export function toDimahS3Error(
  err: unknown,
  fallbackMessage: string,
  fallbackStatus = 403,
  options?: { code?: S3ErrorCode | string },
): DimahS3Error {
  if (err instanceof DimahS3Error) return err;

  const message =
    err instanceof Error && err.message.trim() ? err.message : fallbackMessage;
  const status = statusOf(err, fallbackStatus);

  return new DimahS3Error(message, status, {
    cause: err instanceof Error ? err : undefined,
    ...(options?.code !== undefined ? { code: options.code } : {}),
  });
}
