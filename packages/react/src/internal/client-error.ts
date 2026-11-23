import { APIError, isAPIError, s3Error, type S3Api } from "@dimah-s3/core";

/** A better-call error, such as one a custom backend rethrows: its code is in `body`. */
export function isRawAPIError(
  error: unknown,
): error is Error & { statusCode?: unknown; body?: unknown } {
  return error instanceof Error && error.name === "APIError";
}

/**
 * Normalizes a thrown value to an {@link APIError} with a stable `code`.
 * A raw better-call error is rebuilt from its body, because it keeps its code
 * only in `body.code`. Anything else becomes `UNKNOWN_ERROR`.
 */
export function toClientError(error: unknown): APIError {
  if (isAPIError(error)) return error;
  if (isRawAPIError(error)) {
    const status: unknown = error.statusCode;
    const statusCode = typeof status === "number" ? status : undefined;
    const body: unknown = error.body;
    if (!isErrorBody(body)) {
      return s3Error("UNKNOWN_ERROR", undefined, {
        status: statusCode,
        cause: error,
      });
    }
    const rebuilt = APIError.fromShape(
      {
        code: body.code,
        message: body.message ?? body.code,
        ...(isErrorParams(body.params) ? { params: body.params } : {}),
      },
      statusCode,
    );
    rebuilt.cause = error;
    return rebuilt;
  }
  return s3Error("UNKNOWN_ERROR", undefined, { cause: error });
}

/** The hook's `api` option or the provider's, else a setup error naming the hook. */
export function requireApi(api: S3Api | null | undefined, hook: string): S3Api {
  if (api) return api;
  throw new Error(
    `[dimah-s3] No S3Api found. Pass \`api\` to ${hook} or wrap with <S3Provider>.`,
  );
}

function isErrorBody(
  body: unknown,
): body is { code: string; message?: string; params?: unknown } {
  if (typeof body !== "object" || body === null) return false;
  const { code, message } = body as { code?: unknown; message?: unknown };
  return (
    typeof code === "string" &&
    (message === undefined || typeof message === "string")
  );
}

function isErrorParams(
  params: unknown,
): params is Record<string, string | number> {
  return (
    typeof params === "object" &&
    params !== null &&
    Object.values(params).every(
      (value) => typeof value === "string" || typeof value === "number",
    )
  );
}
