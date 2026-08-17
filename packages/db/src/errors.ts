import { DimahS3Error } from "@dimah-s3/core";

/** Error codes thrown by @dimah-s3/db guards and store operations. */
export type DimahS3DbErrorCode =
  "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT";

const STATUS_BY_CODE: Record<DimahS3DbErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

/**
 * DB-scoped error — extends {@link DimahS3Error} (better-call `APIError`)
 * so HTTP serializes `status` / `code` natively.
 */
export class DimahS3DbError extends DimahS3Error {
  readonly code: DimahS3DbErrorCode;

  constructor(code: DimahS3DbErrorCode, message: string) {
    super(message, STATUS_BY_CODE[code], { code });
    this.name = "DimahS3DbError";
    this.code = code;
  }
}

export function unauthorized(message = "Unauthorized"): DimahS3DbError {
  return new DimahS3DbError("UNAUTHORIZED", message);
}

export function forbidden(message = "Forbidden"): DimahS3DbError {
  return new DimahS3DbError("FORBIDDEN", message);
}

export function notFound(message = "Object not found"): DimahS3DbError {
  return new DimahS3DbError("NOT_FOUND", message);
}

export function conflict(message = "Conflict"): DimahS3DbError {
  return new DimahS3DbError("CONFLICT", message);
}
