import {
  APIError,
  S3_ERROR_CODES,
  isAPIError,
  isS3ErrorCode,
} from "@dimah-s3/core";
import type { RouteOperation } from "@/types/config";

export { APIError, S3_ERROR_CODES, isAPIError, isS3ErrorCode };

/** English API errors with stable codes for client-side localization. */
export const errors = {
  notFound: () => APIError.from("NOT_FOUND", S3_ERROR_CODES.NOT_FOUND),

  unauthorized: () =>
    APIError.from("UNAUTHORIZED", S3_ERROR_CODES.UNAUTHORIZED),

  forbidden: () => APIError.from("FORBIDDEN", S3_ERROR_CODES.FORBIDDEN),

  conflict: () => APIError.from("CONFLICT", S3_ERROR_CODES.CONFLICT),

  internalError: () =>
    APIError.from("INTERNAL_SERVER_ERROR", S3_ERROR_CODES.INTERNAL_ERROR),

  objectNotFound: () =>
    APIError.from("NOT_FOUND", S3_ERROR_CODES.OBJECT_NOT_FOUND),

  featureDisabled: (feature: RouteOperation) =>
    APIError.from("NOT_FOUND", {
      code: S3_ERROR_CODES.FEATURE_DISABLED.code,
      message: S3_ERROR_CODES.FEATURE_DISABLED.message.replaceAll(
        "{feature}",
        feature,
      ),
      params: { feature },
    }),

  invalidKey: () => APIError.from("BAD_REQUEST", S3_ERROR_CODES.INVALID_KEY),

  unknownRoute: (route: string) =>
    APIError.from("NOT_FOUND", {
      code: S3_ERROR_CODES.UNKNOWN_ROUTE.code,
      message: S3_ERROR_CODES.UNKNOWN_ROUTE.message,
      params: { route },
    }),

  fileTypeNotAllowed: (fileName: string, contentType?: string) =>
    APIError.from("BAD_REQUEST", {
      code: S3_ERROR_CODES.FILE_TYPE_NOT_ALLOWED.code,
      message: S3_ERROR_CODES.FILE_TYPE_NOT_ALLOWED.message,
      params: {
        fileName,
        ...(contentType ? { contentType } : {}),
      },
    }),

  s3NetworkError: (code: string) =>
    APIError.from("BAD_GATEWAY", {
      code: S3_ERROR_CODES.S3_NETWORK_ERROR.code,
      message: S3_ERROR_CODES.S3_NETWORK_ERROR.message.replaceAll(
        "{code}",
        code,
      ),
      params: { code },
    }),

  multipartPartMissing: (partNumber: number) =>
    APIError.from("BAD_REQUEST", {
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
    APIError.from("PAYLOAD_TOO_LARGE", {
      ...S3_ERROR_CODES.PAYLOAD_TOO_LARGE,
      message,
    }),

  quotaExceeded: (message: string = S3_ERROR_CODES.QUOTA_EXCEEDED.message) =>
    APIError.from("PAYLOAD_TOO_LARGE", {
      ...S3_ERROR_CODES.QUOTA_EXCEEDED,
      message,
    }),

  validationError: (message: string) =>
    APIError.from("BAD_REQUEST", {
      code: S3_ERROR_CODES.VALIDATION_ERROR.code,
      message,
    }),
} as const;

export type ServerErrors = typeof errors;
