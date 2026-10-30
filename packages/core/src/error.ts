import { APIError as BetterCallAPIError, statusCodes } from "better-call/error";
import {
  formatErrorMessage,
  S3_ERROR_CODES,
  type S3ErrorCode,
  type S3ErrorParams,
} from "./error-codes";

export {
  defineErrorCodes,
  formatErrorMessage,
  S3_ERROR_CODES,
  type S3ClientErrorCode,
  type S3ErrorCode,
  type S3ErrorEntry,
  type S3ErrorParams,
  type S3ErrorParamsMap,
  type S3ErrorShape,
  type S3ServerErrorCode,
} from "./error-codes";

type NamedStatus = NonNullable<
  ConstructorParameters<typeof BetterCallAPIError>[0]
>;

/** better-call status name (`"FORBIDDEN"`) or any numeric HTTP status. */
export type APIErrorStatus = NamedStatus | number;

/** Error body: `{ code, message, params? }` on the wire; `cause` stays local. */
export type APIErrorBody = {
  code: string;
  message: string;
  params?: Record<string, string | number>;
  cause?: unknown;
};

export type S3ErrorOptions = {
  cause?: unknown;
  /** Overrides the catalog status (e.g. `UPLOAD_FAILED` carries S3's). */
  status?: number;
};

const statusNames = new Map<number, keyof typeof statusCodes>(
  (Object.keys(statusCodes) as (keyof typeof statusCodes)[]).map((name) => [
    statusCodes[name],
    name,
  ]),
);

/** Prefer the named status so `statusText` reads `FORBIDDEN`, not `403`. */
function toNamedStatus(status: APIErrorStatus): NamedStatus {
  if (typeof status !== "number") return status;
  return statusNames.get(status) ?? (status as NamedStatus);
}

/**
 * better-call `APIError` — same name and `(status, body)` constructor as
 * `ctx.error(...)`. HTTP serializes `{ code, message, params? }` via native
 * `toResponse`. Build catalog errors with {@link s3Error}.
 */
export class APIError extends BetterCallAPIError {
  constructor(
    status: APIErrorStatus,
    body: APIErrorBody,
    headers?: HeadersInit,
  ) {
    const { cause, ...rest } = body;
    super(toNamedStatus(status), rest, headers);
    this.name = "APIError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }

  /** Stable machine-readable code; always set. */
  get code(): string {
    return (this.body as APIErrorBody).code;
  }

  get params(): Record<string, string | number> | undefined {
    return (this.body as APIErrorBody).params;
  }

  /** Plugin-defined or catalog codes with an explicit status. */
  static from(
    status: APIErrorStatus,
    body: {
      code: string;
      message: string;
      params?: Record<string, string | number>;
    },
  ): APIError {
    return new APIError(status, {
      code: body.code,
      message: body.message,
      ...(body.params !== undefined ? { params: body.params } : {}),
    });
  }

  /**
   * Rebuild from a wire body (e.g. `deleteMany` `failed[].error`).
   * Status: explicit, else the catalog status, else 500.
   */
  static fromShape(
    shape: {
      code: string;
      message: string;
      params?: Record<string, string | number>;
    },
    status?: number,
  ): APIError {
    return APIError.from(status ?? catalogStatus(shape.code) ?? 500, shape);
  }
}

function catalogStatus(code: string): number | undefined {
  return Object.hasOwn(S3_ERROR_CODES, code)
    ? S3_ERROR_CODES[code as S3ErrorCode].status
    : undefined;
}

/**
 * Build a catalog error: status from the entry, message filled from `params`.
 * `options.status` overrides the status; `options.cause` stays server-side.
 */
export function s3Error<C extends S3ErrorCode>(
  code: C,
  ...args: S3ErrorParams<C> extends undefined
    ? [params?: undefined, options?: S3ErrorOptions]
    : [params: S3ErrorParams<C>, options?: S3ErrorOptions]
): APIError {
  const [params, options] = args as [
    Record<string, string | number> | undefined,
    S3ErrorOptions | undefined,
  ];
  const entry = S3_ERROR_CODES[code];
  return new APIError(options?.status ?? entry.status, {
    code,
    message: formatErrorMessage(entry.message, params),
    ...(params !== undefined ? { params } : {}),
    ...(options?.cause !== undefined ? { cause: options.cause } : {}),
  });
}

/**
 * True for {@link APIError} and better-call copies (including duck-typed).
 * A raw better-call error (`ctx.error`, `ValidationError`) keeps its code
 * only in `body.code`; use {@link isS3ErrorCode} to match it by code.
 */
export function isAPIError(error: unknown): error is APIError {
  return (
    error instanceof BetterCallAPIError ||
    error instanceof APIError ||
    (error as { name?: string } | null)?.name === "APIError"
  );
}

/**
 * True when `error` is an {@link APIError} with this catalog `code`. Reads
 * `body.code`, so raw better-call errors match too.
 */
export function isS3ErrorCode<C extends S3ErrorCode>(
  error: unknown,
  code: C,
): error is APIError & { code: C } {
  return (
    isAPIError(error) &&
    (error as { body?: { code?: unknown } }).body?.code === code
  );
}
