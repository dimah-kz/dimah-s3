import { createFetch, type FetchEsque } from "@better-fetch/fetch";
import { APIError, s3Error } from "@/error";
import type { S3ClientFetchOptions, S3Fetch } from "./types";

/** The `{ code, message, params? }` body every API error response carries. */
type ErrorBody = {
  code: string;
  message: string;
  params?: Record<string, string | number>;
};

/**
 * Reads an error body. `code` and `message` must be strings. `params`
 * keeps its string and number entries and drops the rest, so one odd value
 * never costs the error its code; it is left out when nothing is left.
 */
function readErrorBody(value: unknown): ErrorBody | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { code, message, params } = value as Record<string, unknown>;
  if (typeof code !== "string" || typeof message !== "string") return undefined;
  const kept =
    typeof params === "object" && params !== null && !Array.isArray(params)
      ? Object.entries(params).filter(
          (entry): entry is [string, string | number] =>
            typeof entry[1] === "string" || typeof entry[1] === "number",
        )
      : [];
  return kept.length > 0
    ? { code, message, params: Object.fromEntries(kept) }
    : { code, message };
}

async function resolveHeaders(
  headers: S3ClientFetchOptions["headers"],
): Promise<HeadersInit | undefined> {
  if (headers == null) return undefined;
  if (typeof headers === "function") return headers();
  return headers;
}

/**
 * Map a non-OK response onto an {@link APIError} that keeps the HTTP status.
 * A `{ code, message, params? }` body keeps its code. Any other body becomes
 * `INTERNAL_ERROR` (status ≥ 500) or `UNKNOWN_ERROR`.
 */
function apiErrorFromResponse(status: number, body: unknown): APIError {
  const shape = readErrorBody(body);
  if (shape) return APIError.fromShape(shape, status);
  const code = status >= 500 ? "INTERNAL_ERROR" : "UNKNOWN_ERROR";
  return s3Error(code, undefined, { status });
}

/**
 * Whether a 2xx body parsed as a JSON object or array. better-fetch returns
 * the raw text when a body is not JSON (an SPA fallback `index.html`) and a
 * `Blob` for binary types; neither is an API response.
 */
function isJsonBody(data: unknown): boolean {
  if (Array.isArray(data)) return true;
  if (data === null || typeof data !== "object") return false;
  const prototype: unknown = Object.getPrototypeOf(data);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Wrap `fetch` so a request that never gets a response throws
 * `NETWORK_ERROR`. An aborted request rethrows the abort reason as is.
 */
function withNetworkErrors(
  fetchImpl: S3ClientFetchOptions["fetch"],
): FetchEsque {
  return async (input, init) => {
    try {
      return await (fetchImpl ?? fetch)(input, init);
    } catch (error) {
      // The abort reason, as `fetch` itself rejects with it.
      if (init?.signal?.aborted) throw init.signal.reason;
      throw s3Error("NETWORK_ERROR", undefined, { cause: error });
    }
  };
}

/**
 * Shared `$fetch` for core routes and client plugins.
 * `base` is a normalized API prefix (e.g. `/api/s3`).
 *
 * Client `headers` are applied first and per-call `headers` win.
 * Every failure throws {@link APIError}: a non-OK response keeps its HTTP
 * status, a 2xx response without a JSON object or array body throws
 * `UNKNOWN_ERROR` with that status, and a failed request throws
 * `NETWORK_ERROR`.
 */
export function createS3Fetch(
  base: string,
  options?: S3ClientFetchOptions,
): S3Fetch {
  return createFetch({
    baseURL: base,
    throw: true,
    customFetchImpl: withNetworkErrors(options?.fetch),
    credentials: options?.credentials,
    onRequest: async (ctx) => {
      const clientHeaders = await resolveHeaders(options?.headers);
      if (!clientHeaders) return ctx;
      const headers = new Headers(clientHeaders);
      for (const [key, value] of ctx.headers) {
        headers.set(key, value);
      }
      return { ...ctx, headers };
    },
    onSuccess: (ctx) => {
      if (isJsonBody(ctx.data)) return;
      throw s3Error("UNKNOWN_ERROR", undefined, {
        status: ctx.response.status,
      });
    },
    onError: (ctx) => {
      // better-fetch spreads the parsed JSON body with `status` / `statusText`.
      throw apiErrorFromResponse(ctx.response.status, ctx.error);
    },
  });
}
