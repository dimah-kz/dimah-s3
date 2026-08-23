import {
  DimahS3Error,
  S3_ERROR_CODES,
  isAPIError,
  isDimahS3Error,
  isS3ErrorCode,
} from "@dimah-s3/core";

export {
  DimahS3Error,
  S3_ERROR_CODES,
  isAPIError,
  isDimahS3Error,
  isS3ErrorCode,
};

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

  featureDisabled: (feature: string) =>
    DimahS3Error.from("NOT_FOUND", {
      code: S3_ERROR_CODES.FEATURE_DISABLED.code,
      message: S3_ERROR_CODES.FEATURE_DISABLED.message.replaceAll(
        "{feature}",
        feature,
      ),
      params: { feature },
    }),

  invalidKey: () =>
    DimahS3Error.from("BAD_REQUEST", S3_ERROR_CODES.INVALID_KEY),

  invalidBucket: (bucket: string) =>
    DimahS3Error.from("FORBIDDEN", {
      code: S3_ERROR_CODES.INVALID_BUCKET.code,
      message: S3_ERROR_CODES.INVALID_BUCKET.message,
      params: { bucket },
    }),

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

  multipartPartMissing: (partNumber: number) =>
    DimahS3Error.from("BAD_REQUEST", {
      code: S3_ERROR_CODES.MULTIPART_PART_MISSING.code,
      message: S3_ERROR_CODES.MULTIPART_PART_MISSING.message.replaceAll(
        "{partNumber}",
        String(partNumber),
      ),
      params: { partNumber },
    }),

  payloadTooLarge: (
    message: string = S3_ERROR_CODES.PAYLOAD_TOO_LARGE.message,
  ) =>
    DimahS3Error.from("PAYLOAD_TOO_LARGE", {
      ...S3_ERROR_CODES.PAYLOAD_TOO_LARGE,
      message,
    }),

  validationError: (message: string) =>
    DimahS3Error.from("BAD_REQUEST", {
      code: S3_ERROR_CODES.VALIDATION_ERROR.code,
      message,
    }),
} as const;

export type ServerErrors = typeof errors;
