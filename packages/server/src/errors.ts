import {
  DimahS3Error,
  S3_ERROR_CODES,
  isAPIError,
  isDimahS3Error,
} from "@dimah-s3/core";

export { DimahS3Error, isAPIError, isDimahS3Error };

/** English API errors with stable codes for client-side localization. */
export const errors = {
  notFound: () => DimahS3Error.from("NOT_FOUND", S3_ERROR_CODES.NOT_FOUND),

  unauthorized: () =>
    DimahS3Error.from("UNAUTHORIZED", S3_ERROR_CODES.UNAUTHORIZED),

  forbidden: () => DimahS3Error.from("FORBIDDEN", S3_ERROR_CODES.FORBIDDEN),

  conflict: () => DimahS3Error.from("CONFLICT", S3_ERROR_CODES.CONFLICT),

  internalError: () =>
    DimahS3Error.from("INTERNAL_SERVER_ERROR", S3_ERROR_CODES.INTERNAL_ERROR),

  objectNotFound: () =>
    DimahS3Error.from("NOT_FOUND", S3_ERROR_CODES.OBJECT_NOT_FOUND),

  s3NetworkError: (code: string) =>
    DimahS3Error.from("BAD_GATEWAY", {
      code: S3_ERROR_CODES.S3_NETWORK_ERROR.code,
      message: S3_ERROR_CODES.S3_NETWORK_ERROR.message.replaceAll(
        "{code}",
        code,
      ),
      params: { code },
    }),

  fileSizeRequiredUpload: () =>
    DimahS3Error.from("BAD_REQUEST", S3_ERROR_CODES.FILE_SIZE_REQUIRED_UPLOAD),

  fileSizeRequiredMultipart: () =>
    DimahS3Error.from(
      "BAD_REQUEST",
      S3_ERROR_CODES.FILE_SIZE_REQUIRED_MULTIPART,
    ),

  validationError: (message: string) =>
    DimahS3Error.from("BAD_REQUEST", {
      code: S3_ERROR_CODES.VALIDATION_ERROR.code,
      message,
    }),
} as const;

export type ServerErrors = typeof errors;
