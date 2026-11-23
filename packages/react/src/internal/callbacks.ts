import { s3Error, type APIError } from "@dimah-s3/core";
import type { OperationOutcome } from "@/types/operation";

/** What a `before*` callback decided. */
export type BeforeCallbackResult =
  | { status: "allowed" }
  | { status: "blocked" }
  | { status: "error"; error: APIError };

/**
 * Runs a `before*` callback once for a call. Returning `false` blocks the
 * call. A throw or rejection becomes `HOOK_FAILED` with the error as `cause`.
 * A missing callback allows the call.
 */
export async function runBeforeCallback<TArgs extends unknown[]>(
  name: string,
  callback: ((...args: TArgs) => boolean | Promise<boolean>) | undefined,
  ...args: TArgs
): Promise<BeforeCallbackResult> {
  if (!callback) return { status: "allowed" };
  try {
    const allowed = await callback(...args);
    return allowed ? { status: "allowed" } : { status: "blocked" };
  } catch (error) {
    return { status: "error", error: hookFailed(name, error) };
  }
}

/**
 * Runs an `on*Start` callback. Returns `HOOK_FAILED` when it throws, so the
 * caller can fail the call, and `null` otherwise.
 */
export function runStartCallback<TArgs extends unknown[]>(
  name: string,
  callback: ((...args: TArgs) => void) | undefined,
  ...args: TArgs
): APIError | null {
  try {
    callback?.(...args);
    return null;
  } catch (error) {
    return hookFailed(name, error);
  }
}

/**
 * Runs and awaits an after-callback (`onSuccess`, `onError`, `onSettled`).
 * A throw or rejection goes to {@link reportCallbackError} and never changes
 * the outcome.
 */
export async function runAfterCallback<TArgs extends unknown[]>(
  callback: ((...args: TArgs) => void | Promise<void>) | undefined,
  ...args: TArgs
): Promise<void> {
  if (!callback) return;
  try {
    await callback(...args);
  } catch (error) {
    reportCallbackError(error);
  }
}

/** The after-callbacks of a hook whose calls settle one key each. */
export type OperationCallbacks<TData> = {
  onError?: (error: APIError, key: string) => void | Promise<void>;
  onSuccess?: (data: TData, key: string) => void | Promise<void>;
  onSettled?: (outcome: OperationOutcome<TData>) => void | Promise<void>;
};

/**
 * Runs the after-callbacks for one settled single-key call: `onError` or
 * `onSuccess`, then `onSettled`. Call it once the key is free, so a callback
 * can start the same key again.
 */
export async function reportOperationOutcome<TData>(
  { onError, onSuccess, onSettled }: OperationCallbacks<TData>,
  outcome: OperationOutcome<TData>,
): Promise<void> {
  if (outcome.status === "error") {
    await runAfterCallback(onError, outcome.error, outcome.key);
  } else if (outcome.status === "success") {
    await runAfterCallback(onSuccess, outcome.data, outcome.key);
  }
  await runAfterCallback(onSettled, outcome);
}

/**
 * Runs a progress-style callback (`onProgress`, `onFileReject`, ...)
 * synchronously. A throw goes to {@link reportCallbackError}, never rethrown.
 */
export function notify<TArgs extends unknown[]>(
  callback: ((...args: TArgs) => void) | undefined,
  ...args: TArgs
): void {
  try {
    callback?.(...args);
  } catch (error) {
    reportCallbackError(error);
  }
}

/**
 * Reports an error thrown by a consumer callback without rethrowing it:
 * through the global `reportError` when the runtime has one (browsers), and
 * `console.error` otherwise.
 */
export function reportCallbackError(error: unknown): void {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
  } else {
    console.error(error);
  }
}

/** `HOOK_FAILED` for a consumer callback named `hook` that threw `cause`. */
export function hookFailed(hook: string, cause: unknown): APIError {
  return s3Error("HOOK_FAILED", { hook }, { cause });
}
