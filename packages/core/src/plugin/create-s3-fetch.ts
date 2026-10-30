import { createFetch, type FetchEsque } from "@better-fetch/fetch";
import { APIError, s3Error } from "@/error";
import { s3FetchErrorSchema } from "@/schema/error";
import type { S3ClientFetchOptions, S3Fetch } from "./types";

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
  const shape = s3FetchErrorSchema.safeParse(body);
  if (shape.success) return APIError.fromShape(shape.data, status);
  const code = status >= 500 ? "INTERNAL_ERROR" : "UNKNOWN_ERROR";
  return s3Error(code, undefined, { status });
}

/**
 * Wrap `fetch` so a request that never gets a response throws
 * `NETWORK_ERROR`. An aborted request rethrows the abort reason as is.
 */
function withNetworkErrors(fetchImpl: typeof fetch | undefined): FetchEsque {
  return async (input, init) => {
    try {
      return await (fetchImpl ?? fetch)(input, init);
    } catch (error) {
      if (init?.signal?.aborted) throw error;
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
 * status, and a failed request throws `NETWORK_ERROR`.
 */
export function createS3Fetch(
  base: string,
  options?: S3ClientFetchOptions,
): S3Fetch {
  return createFetch({
    baseURL: base,
    throw: true,
    errorSchema: s3FetchErrorSchema,
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
    onError: (ctx) => {
      // better-fetch spreads the parsed JSON body with `status` / `statusText`.
      throw apiErrorFromResponse(ctx.response.status, ctx.error);
    },
  });
}
