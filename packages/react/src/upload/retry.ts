import { isS3ErrorCode, type APIError } from "@dimah-s3/core";
import { delay } from "@/internal/abortable";
import type { RetryConfig } from "@/types/upload";
import {
  MAX_RETRIES,
  RETRY_BASE_DELAY,
  URL_EXPIRY_MARGIN_MS,
} from "./constants";

export type RetryOptions = { retry?: RetryConfig; signal?: AbortSignal };

/**
 * Whether a failed request may succeed if sent again: `NETWORK_ERROR`,
 * `S3_NETWORK_ERROR`, and `UPLOAD_FAILED` with a 5xx or 429 status.
 */
export function isRetryableError(error: unknown): boolean {
  if (
    isS3ErrorCode(error, "NETWORK_ERROR") ||
    isS3ErrorCode(error, "S3_NETWORK_ERROR")
  ) {
    return true;
  }
  if (!isS3ErrorCode(error, "UPLOAD_FAILED")) return false;
  const status = s3Status(error);
  return status >= 500 || status === 429;
}

/**
 * The S3 status of an `UPLOAD_FAILED` error: its `status` param, which
 * holds what S3 answered, else its HTTP status. A transport may build the
 * error without the `status` option, which leaves the catalog status 502.
 */
function s3Status(error: APIError): number {
  return Number(error.params?.status ?? error.statusCode);
}

/**
 * Runs `task`, and retries a failure that `canRetry` accepts (by default
 * {@link isRetryableError}) with exponential backoff. Rejects with
 * `signal.reason` once the signal aborts.
 */
export async function withRetry<T>(
  task: () => Promise<T>,
  options: RetryOptions & { canRetry?: (error: unknown) => boolean },
): Promise<T> {
  const { retry, signal, canRetry = isRetryableError } = options;
  const maxRetries = retry?.maxRetries ?? MAX_RETRIES;
  const baseDelay = retry?.baseDelay ?? RETRY_BASE_DELAY;

  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      return await task();
    } catch (error) {
      signal?.throwIfAborted();
      if (attempt >= maxRetries || !canRetry(error)) throw error;
    }
    await delay(baseDelay * 2 ** attempt, signal);
  }
}

/**
 * Signs a presigned request with `sign` and sends it with `send`, with
 * retries. A dead URL is never reused: the request is signed again before a
 * retry once its URL has expired, and a 403 from an expired URL is retried
 * with a new one. Resolves with the signing response that was sent.
 */
export async function withPresignedRetry<TSigned extends { expiresIn: number }>(
  sign: () => Promise<TSigned>,
  send: (signed: TSigned) => Promise<void>,
  options: RetryOptions,
): Promise<TSigned> {
  let current: { signed: TSigned; expiresAt: number } | null = null;
  let expired = false;

  return withRetry(
    async () => {
      if (current === null || expired || isPastExpiry(current.expiresAt)) {
        expired = false;
        const signedAt = Date.now();
        const signed = await sign();
        current = { signed, expiresAt: signedAt + signed.expiresIn * 1000 };
      }
      const { signed, expiresAt } = current;
      try {
        await send(signed);
        return signed;
      } catch (error) {
        expired =
          isS3ErrorCode(error, "UPLOAD_FAILED") &&
          s3Status(error) === 403 &&
          isPastExpiry(expiresAt);
        throw error;
      }
    },
    { ...options, canRetry: (error) => expired || isRetryableError(error) },
  );
}

function isPastExpiry(expiresAt: number): boolean {
  return Date.now() >= expiresAt - URL_EXPIRY_MARGIN_MS;
}
