import { isAPIError } from "@dimah-s3/core";
import { MAX_RETRIES, RETRY_BASE_DELAY } from "./constants";
import type { RetryConfig } from "@/types";

function isNonRetryable(err: unknown): boolean {
  if ((err as Error).name === "AbortError") return true;
  if (!isAPIError(err)) return false;
  const status = err.statusCode;
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    status !== 429
  );
}

function waitForRetry(delay: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Upload aborted", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Upload aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retryConfig: RetryConfig | undefined,
  signal?: AbortSignal,
): Promise<T> {
  const maxRetries = retryConfig?.maxRetries ?? MAX_RETRIES;
  const baseDelay = retryConfig?.baseDelay ?? RETRY_BASE_DELAY;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isNonRetryable(err)) throw err;
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelay * 2 ** attempt;
        await waitForRetry(delay, signal);
      }
    }
  }
  throw lastError;
}
