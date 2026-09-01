import { APIError, S3_ERROR_CODES } from "@dimah-s3/core";

export function unauthorized(
  message: string = S3_ERROR_CODES.UNAUTHORIZED.message,
): APIError {
  return APIError.from("UNAUTHORIZED", {
    ...S3_ERROR_CODES.UNAUTHORIZED,
    message,
  });
}

export function forbidden(
  message: string = S3_ERROR_CODES.FORBIDDEN.message,
): APIError {
  return APIError.from("FORBIDDEN", {
    ...S3_ERROR_CODES.FORBIDDEN,
    message,
  });
}

export function notFound(
  message: string = S3_ERROR_CODES.OBJECT_NOT_FOUND.message,
): APIError {
  return APIError.from("NOT_FOUND", {
    ...S3_ERROR_CODES.OBJECT_NOT_FOUND,
    message,
  });
}

export function conflict(
  message: string = S3_ERROR_CODES.CONFLICT.message,
): APIError {
  return APIError.from("CONFLICT", {
    ...S3_ERROR_CODES.CONFLICT,
    message,
  });
}
