import { DimahS3Error } from "@dimah-s3/core";
import { errors, toDimahS3Error } from "./errors";

/**
 * Run a guard hook. {@link DimahS3Error} is preserved; plain Errors keep their
 * English message without a library `code` so client `useFormatDimahError` does
 * not replace them with a generic mapped string.
 */
export async function runHook<T extends { request: Request }>(
  hook: ((context: T) => Promise<void> | void) | undefined,
  context: T,
): Promise<void> {
  if (!hook) return;
  try {
    await hook(context);
  } catch (err) {
    if (err instanceof DimahS3Error) throw err;
    if (err instanceof Error && err.message.trim()) {
      // No library `code` — client shows this English message as-is.
      throw toDimahS3Error(err, errors.forbidden().message, 403);
    }
    throw errors.forbidden();
  }
}

/**
 * Run a lifecycle `on*` hook. Failures become {@link errors.internalError}
 * (or preserve an existing {@link DimahS3Error}).
 */
export async function runLifecycleHook<T extends { request: Request }>(
  hook: ((context: T) => Promise<void> | void) | undefined,
  context: T,
): Promise<void> {
  if (!hook) return;
  try {
    await hook(context);
  } catch (err) {
    if (err instanceof DimahS3Error) throw err;
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
