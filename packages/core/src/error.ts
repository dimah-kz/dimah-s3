import { APIError as BetterCallAPIError, statusCodes } from "better-call/error";
import {
  formatErrorMessage,
  S3_ERROR_CODES,
  type S3ErrorCode,
  type S3ErrorCodeEntry,
  type S3ErrorEntryParams,
  type S3ErrorParams,
} from "./error-codes";

export {
  defineErrorCodes,
  ERROR_CODE_PATTERN,
  formatErrorMessage,
  S3_ERROR_CODES,
  type S3ClientErrorCode,
  type S3ErrorCatalog,
  type S3ErrorCode,
  type S3ErrorCodeEntry,
  type S3ErrorEntry,
  type S3ErrorEntryParams,
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

/** `params`, then `options`. `params` is optional when the message has no placeholders. */
type S3ErrorArgs<P> = undefined extends P
  ? [params?: P, options?: S3ErrorOptions]
  : [params: P, options?: S3ErrorOptions];

/** A core code, or an entry of a plugin's `$ERROR_CODES`. */
type CodeOrEntry = S3ErrorCode | S3ErrorCodeEntry;

/** The code a {@link CodeOrEntry} names. */
type CodeOf<C extends CodeOrEntry> = C extends S3ErrorCodeEntry ? C["code"] : C;

/** The `params` a {@link CodeOrEntry} takes. */
type ParamsOf<C extends CodeOrEntry> = C extends S3ErrorCode
  ? S3ErrorParams<C>
  : C extends S3ErrorCodeEntry
    ? S3ErrorEntryParams<C>
    : never;

/**
 * Build an error from a catalog entry: status from the entry, message filled
 * from `params`. `options.status` overrides the status; `options.cause`
 * stays server-side.
 *
 * Pass a core code, or an entry of a plugin's `$ERROR_CODES`:
 *
 * ```ts
 * throw s3Error("FILE_TOO_LARGE", { size, maxFileSize });
 * throw s3Error(AUDIT_ERROR_CODES.AUDIT_ROUTE_UNTRACKED, { route });
 * ```
 */
export function s3Error<C extends CodeOrEntry>(
  code: C,
  ...args: S3ErrorArgs<ParamsOf<C>>
): APIError {
  const [params, options] = args as [
    Record<string, string | number> | undefined,
    S3ErrorOptions | undefined,
  ];
  const entry: S3ErrorCodeEntry =
    typeof code === "string" ? S3_ERROR_CODES[code as S3ErrorCode] : code;
  return new APIError(options?.status ?? entry.status, {
    code: entry.code,
    message: formatErrorMessage(entry.message, params),
    ...(params !== undefined ? { params } : {}),
    ...(options?.cause !== undefined ? { cause: options.cause } : {}),
  });
}

/**
 * True for an {@link APIError}: an instance, or one from another copy of
 * this package (named `APIError`, with a string `code` and a numeric
 * `statusCode`), so `error.code` and `error.params` are really there. A
 * raw better-call error, which keeps its code only in `body`, is not one.
 */
export function isAPIError(error: unknown): error is APIError {
  if (error instanceof APIError) return true;
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    statusCode?: unknown;
  } | null;
  return (
    candidate?.name === "APIError" &&
    typeof candidate.code === "string" &&
    typeof candidate.statusCode === "number"
  );
}

/**
 * True when `error` is an {@link APIError} with this code, so its `params`
 * have that code's type. Pass a core code, or an entry of a plugin's
 * `$ERROR_CODES`.
 */
export function isS3ErrorCode<C extends CodeOrEntry>(
  error: unknown,
  code: C,
): error is APIError & { code: CodeOf<C>; params: ParamsOf<C> } {
  const name = typeof code === "string" ? code : code.code;
  return isAPIError(error) && error.code === name;
}
