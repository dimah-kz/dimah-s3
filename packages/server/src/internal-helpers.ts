import { DimahS3Error, isAPIError } from "@dimah-s3/core";
import { errors } from "./errors";

/**
 * Run a guard hook. {@link isAPIError} values are preserved; plain Errors keep
 * their English message without a library `code` so client
 * `useFormatDimahError` does not replace them with a generic mapped string.
 */
export async function runHook<T extends { request: Request }>(
  hook: ((context: T) => Promise<void> | void) | undefined,
  context: T,
): Promise<void> {
  if (!hook) return;
  try {
    await hook(context);
  } catch (err) {
    if (isAPIError(err)) throw err;
    if (err instanceof Error && err.message.trim()) {
      throw new DimahS3Error("FORBIDDEN", {
        message: err.message,
        cause: err,
      });
    }
    throw errors.forbidden();
  }
}

/**
 * Run a lifecycle `on*` hook. Failures become {@link errors.internalError}
 * (or preserve an existing APIError).
 */
export async function runLifecycleHook<T extends { request: Request }>(
  hook: ((context: T) => Promise<void> | void) | undefined,
  context: T,
): Promise<void> {
  if (!hook) return;
  try {
    await hook(context);
  } catch (err) {
    if (isAPIError(err)) throw err;
    console.error("[S3 API] lifecycle hook failed", err);
    throw errors.internalError();
  }
}

export function normalizeExpiresIn(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 600;
}

/** Build a synthetic Request for server-side `api` calls. */
export function requestFromHeaders(headers?: HeadersInit): Request {
  return new Request("http://dimah-s3.local", { headers });
}
