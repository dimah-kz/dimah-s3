import { APIError, s3Error } from "@dimah-s3/core";
import { APIError as BetterCallAPIError, statusCodes } from "better-call/error";
import type { S3Operation } from "@/types/hook-contexts";
import type { ResolvedConfig } from "@/types/resolved";

/** Socket error codes that mean the S3 endpoint could not be reached. */
const NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/** better-call status names by number (`403` → `"FORBIDDEN"`). */
const STATUS_NAMES = new Map<number, string>(
  Object.entries(statusCodes).map(([name, status]) => [status, name]),
);

/**
 * A server misconfiguration found while handling a call, such as a guard
 * that returned a boolean. The error boundary logs it and returns
 * `500 INTERNAL_ERROR`.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export type ErrorBoundaryEnv = Pick<ResolvedConfig, "logger" | "onError">;

/**
 * Maps anything a call throws to the {@link APIError} the client receives.
 *
 * - An `APIError` passes through. A raw better-call error gets a code:
 *   `UNSUPPORTED_MEDIA_TYPE`, `VALIDATION_ERROR` for a bad request, or the
 *   code and message it carries.
 * - A socket error from S3 becomes `S3_NETWORK_ERROR`.
 * - Anything else becomes `INTERNAL_ERROR`.
 *
 * Failures that are not an `APIError` are logged and passed to `onError`,
 * unless the client already went away. Only a real better-call error passes
 * through: another library's error that is merely named `APIError` is an
 * unexpected failure like any other.
 */
export function toAPIError(
  error: unknown,
  env: ErrorBoundaryEnv,
  request: Request,
  operation?: S3Operation,
): APIError {
  if (isHttpError(error)) return normalizeAPIError(error);

  const networkCode = socketErrorCode(error);
  const result = networkCode
    ? s3Error("S3_NETWORK_ERROR", { code: networkCode }, { cause: error })
    : s3Error("INTERNAL_ERROR", undefined, { cause: error });

  // An aborted request is a client disconnect, not a server failure.
  if (!request.signal.aborted) {
    report(error, result, env, { request, operation });
  }
  return result;
}

function report(
  error: unknown,
  result: APIError,
  env: ErrorBoundaryEnv,
  context: { request: Request; operation?: S3Operation },
): void {
  env.logger.error?.(logMessage(error, result), error);
  const failed = (hookError: unknown) => {
    env.logger.error?.("onError threw", hookError);
  };
  try {
    // An async onError must not become an unhandled rejection.
    void Promise.resolve(env.onError?.(error, context)).catch(failed);
  } catch (hookError) {
    failed(hookError);
  }
}

/**
 * A better-call `APIError` (core's extends it), or a copy from another
 * better-call instance: named `APIError`, with a numeric `statusCode` and
 * a string `body.code`.
 */
function isHttpError(error: unknown): error is RawAPIError {
  if (error instanceof APIError || error instanceof BetterCallAPIError) {
    return true;
  }
  const candidate = error as Partial<RawAPIError> | null;
  return (
    candidate?.name === "APIError" &&
    typeof candidate.statusCode === "number" &&
    typeof candidate.body?.code === "string"
  );
}

function logMessage(error: unknown, result: APIError): string {
  if (error instanceof ConfigError) return `Config error: ${error.message}`;
  if (result.code === "S3_NETWORK_ERROR") return result.message;
  return error instanceof Error ? error.message : String(error);
}

function socketErrorCode(error: unknown): string | undefined {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown } | null)?.code;
    if (typeof code === "string" && NETWORK_CODES.has(code)) return code;
  }
  return undefined;
}

/** A better-call error from another copy of the library, or a duck-typed one. */
type RawAPIError = {
  name: string;
  message: string;
  body?: {
    code?: unknown;
    message?: unknown;
    params?: Record<string, string | number>;
  };
  statusCode?: unknown;
  headers?: HeadersInit;
};

/** Gives a raw better-call (or duck-typed) error a stable catalog-style code. */
function normalizeAPIError(error: RawAPIError): APIError {
  if (error instanceof APIError) return error;

  const body = error.body ?? {};
  const status = typeof error.statusCode === "number" ? error.statusCode : 500;
  const message =
    typeof body.message === "string" ? body.message : error.message;
  const code =
    typeof body.code === "string"
      ? body.code
      : (STATUS_NAMES.get(status) ?? "INTERNAL_ERROR");

  switch (code) {
    case "UNSUPPORTED_MEDIA_TYPE":
      return s3Error("UNSUPPORTED_MEDIA_TYPE", undefined, { cause: error });
    case "BAD_REQUEST":
    case "VALIDATION_ERROR":
      return s3Error("VALIDATION_ERROR", { issue: message }, { cause: error });
    case "INTERNAL_SERVER_ERROR":
      return s3Error("INTERNAL_ERROR", undefined, { cause: error });
  }

  return new APIError(
    status,
    {
      code,
      message,
      ...(body.params !== undefined ? { params: body.params } : {}),
      cause: error,
    },
    error.headers,
  );
}
