import { APIError as BetterCallAPIError } from "better-call/error";
import { type S3ErrorCode } from "./error-codes";

export {
  defineErrorCodes,
  S3_ERROR_CODES,
  type S3ErrorCode,
} from "./error-codes";

type NamedStatus = ConstructorParameters<typeof BetterCallAPIError>[0];
type APIErrorStatus = NamedStatus | number;
type APIErrorBody = ConstructorParameters<typeof BetterCallAPIError>[1] & {
  params?: Record<string, string | number>;
  cause?: unknown;
};

/**
 * better-call `APIError` — same name and `(status, body)` constructor as
 * `ctx.error(...)`. HTTP serializes `{ message, code?, params? }` via native
 * `toResponse`.
 */
export class APIError extends BetterCallAPIError {
  constructor(
    status: APIErrorStatus = "BAD_REQUEST",
    body?: APIErrorBody,
    headers?: HeadersInit,
  ) {
    const { cause, ...rest } = body ?? {};
    super(
      status as NamedStatus,
      Object.keys(rest).length > 0 ? rest : undefined,
      headers,
    );
    this.name = "APIError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }

  get code(): string | undefined {
    return this.body?.code;
  }

  get params(): Record<string, string | number> | undefined {
    return this.body?.params as Record<string, string | number> | undefined;
  }

  /** Throw a catalog (or custom) `{ code, message }` with an HTTP status. */
  static from(
    status: APIErrorStatus,
    error: {
      code: string;
      message: string;
      params?: Record<string, string | number>;
    },
  ): APIError {
    return new APIError(status, {
      message: error.message,
      code: error.code,
      ...(error.params !== undefined ? { params: error.params } : {}),
    });
  }

  static fromStatus(status: APIErrorStatus, body?: APIErrorBody): APIError {
    return new APIError(status, body);
  }
}

/** True for {@link APIError} and better-call copies (including duck-typed). */
export function isAPIError(error: unknown): error is APIError {
  return (
    error instanceof BetterCallAPIError ||
    error instanceof APIError ||
    (error as { name?: string } | null)?.name === "APIError"
  );
}

/** True when `error` is an {@link APIError} with this catalog `code`. */
export function isS3ErrorCode<C extends S3ErrorCode>(
  error: unknown,
  code: C,
): error is APIError & { code: C } {
  return isAPIError(error) && error.code === code;
}
