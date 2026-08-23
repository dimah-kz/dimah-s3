import { MAX_RETRIES, RETRY_BASE_DELAY } from "./constants";
import type { RetryConfig } from "@/types";

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
      if ((err as Error).name === "AbortError") throw err;
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelay * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
        if (signal?.aborted)
          throw new DOMException("Upload aborted", "AbortError");
      }
    }
  }
  throw lastError;
}
