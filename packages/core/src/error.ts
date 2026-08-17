import { APIError } from "better-call/error";

export {
  defineErrorCodes,
  S3_ERROR_CODES,
  type S3ErrorCode,
} from "./error-codes";

export type DimahS3ErrorParams = Record<string, string | number>;

export type DimahS3ErrorStatus = NonNullable<
  ConstructorParameters<typeof APIError>[0]
>;

export type DimahS3ErrorBody = {
  message?: string;
  code?: string;
  cause?: unknown;
  params?: DimahS3ErrorParams;
} & Record<string, unknown>;

type RawError = {
  code: string;
  message: string;
  params?: DimahS3ErrorParams;
};

/**
 * Typed API error. Same constructor as better-call {@link APIError}
 * (`status`, `body`) so `ctx.error(...)` and `DimahS3Error.from(...)` share
 * a shape. HTTP serializes `{ message, code?, params? }` via native `toResponse`.
 */
export class DimahS3Error extends APIError {
  constructor(
    status: DimahS3ErrorStatus = "BAD_REQUEST",
    body?: DimahS3ErrorBody,
    headers?: HeadersInit,
  ) {
    const { cause, ...rest } = body ?? {};
    super(status, Object.keys(rest).length > 0 ? rest : undefined, headers);
    this.name = "DimahS3Error";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }

  get code(): string | undefined {
    return this.body?.code;
  }

  get params(): DimahS3ErrorParams | undefined {
    return this.body?.params as DimahS3ErrorParams | undefined;
  }

  /** Throw a catalog (or custom) `{ code, message }` with an HTTP status. */
  static from(status: DimahS3ErrorStatus, error: RawError): DimahS3Error {
    return new DimahS3Error(status, {
      message: error.message,
      code: error.code,
      ...(error.params !== undefined ? { params: error.params } : {}),
    });
  }

  static fromStatus(
    status: DimahS3ErrorStatus,
    body?: DimahS3ErrorBody,
  ): DimahS3Error {
    return new DimahS3Error(status, body);
  }
}

/** True for {@link DimahS3Error} and better-call `APIError` (including duck-typed copies). */
export function isAPIError(error: unknown): error is APIError {
  if (error instanceof APIError) return true;
  const name = (error as { name?: string } | null)?.name;
  return name === "APIError" || name === "DimahS3Error";
}

export function isDimahS3Error(error: unknown): error is DimahS3Error {
  return (
    error instanceof DimahS3Error ||
    (error as { name?: string } | null)?.name === "DimahS3Error"
  );
}
