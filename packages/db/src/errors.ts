import { DimahS3Error, S3_ERROR_CODES } from "@dimah-s3/core";

export function unauthorized(
  message: string = S3_ERROR_CODES.UNAUTHORIZED.message,
): DimahS3Error {
  return DimahS3Error.from("UNAUTHORIZED", {
    ...S3_ERROR_CODES.UNAUTHORIZED,
    message,
  });
}

export function forbidden(
  message: string = S3_ERROR_CODES.FORBIDDEN.message,
): DimahS3Error {
  return DimahS3Error.from("FORBIDDEN", {
    ...S3_ERROR_CODES.FORBIDDEN,
    message,
  });
}

export function notFound(
  message: string = S3_ERROR_CODES.OBJECT_NOT_FOUND.message,
): DimahS3Error {
  return DimahS3Error.from("NOT_FOUND", {
    ...S3_ERROR_CODES.NOT_FOUND,
    message,
  });
}

export function conflict(
  message: string = S3_ERROR_CODES.CONFLICT.message,
): DimahS3Error {
  return DimahS3Error.from("CONFLICT", {
    ...S3_ERROR_CODES.CONFLICT,
    message,
  });
}
